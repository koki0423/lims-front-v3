import { Router } from '../../js/router.js';
import { scanStudentIdWithRetry } from "../../js/nfcReader.js";

// 廃棄機能の状態管理
const disposalState = {
    data: {},   // 入力データ（フォームの値）
    asset: null, // 管理番号から引いた asset 1件分
    submitting: false,
};

// 履歴データのモック（とりあえず現状維持）
const mockHistory = [
    { id: 'OFS-20251101-001', name: 'MacBook Air M2', reason: '画面破損', date: '2025-11-02', user: 'AB12345' },
    { id: 'OFS-20251015-005', name: 'HDMIケーブル', reason: '老朽化', date: '2025-10-30', user: 'CD67890' },
];

// 管理番号の正規化（旧 Dispose.js の normalizeMgmtInput 相当）
function normalizeMgmtInput(s) {
    if (!s) {
        return '';
    }
    let t = String(s).normalize('NFKC').trim();
    // いろんなハイフンを全部 '-' に揃える
    t = t.replace(/[‐-‒–—―ー−]/g, '-');
    return t.toUpperCase();
}

// APIレスポンスから配列をいい感じに抜き出すヘルパ
function extractListPayload(resData, preferredKeys) {
    // axios で返ってくる { data: {...} } にも対応
    const src = resData && resData.data ? resData.data : resData;

    if (Array.isArray(src)) {
        return src;
    }
    if (!src || typeof src !== 'object') {
        return [];
    }

    if (Array.isArray(src.items)) {
        return src.items;
    }

    const data = src.data;
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) {
            return data.items;
        }
    }

    if (preferredKeys && Array.isArray(preferredKeys)) {
        for (let i = 0; i < preferredKeys.length; i++) {
            const k = preferredKeys[i];
            const v = src[k];
            if (Array.isArray(v)) {
                return v;
            }
            if (v && typeof v === 'object' && Array.isArray(v.items)) {
                return v.items;
            }
        }
    }

    const entries = Object.entries(src);
    for (let i = 0; i < entries.length; i++) {
        const pair = entries[i];
        const v = pair[1];
        if (Array.isArray(v) && (v.length === 0 || typeof v[0] === 'object')) {
            return v;
        }
    }

    return [];
}

window.DisposalController = {
    // 入力内容を state に保存（途中保存とかで使いたければ）
    saveInput() {
        const form = document.getElementById('form-disposal');
        if (!form) {
            return;
        }
        const formData = new FormData(form);
        for (const pair of formData.entries()) {
            const key = pair[0];
            const val = pair[1];
            disposalState.data[key] = val;
        }
        console.log('Input Data:', disposalState.data);
    },

    // NFCボタン処理
    async NfcRead() {
        const input = document.querySelector('input[name="registrant"]');

        try {
            const result = await scanStudentIdWithRetry(9, 2000);

            if (result.ok) {
                console.log("OK:", result.studentId);
                input.value = result.studentId;
            } else {
                console.log("NG:", result.error);
                input.value = "error";
            }
        } catch (err) {
            console.error("scan error:", err);
            input.value = "error";
        }

        // alert("NFCを読み取りました: " + input.value);
    },

    // 入力画面 -> 確認画面
    async toConfirm() {
        const form = document.getElementById('form-disposal');
        if (!form) {
            return;
        }

        // HTML5 バリデーション
        if (!form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);

        // 管理番号だけ normalize して保存
        const rawMgmt = formData.get('itemId') || '';
        const mgmt = normalizeMgmtInput(rawMgmt);

        if (!mgmt) {
            alert('備品番号を入力してください');
            return;
        }

        disposalState.data.itemId = mgmt;
        disposalState.data.qty = formData.get('qty') || '1';
        disposalState.data.registrant = formData.get('registrant') || '';
        disposalState.data.date = formData.get('date') || '';
        disposalState.data.reason = formData.get('reason') || '';

        if (!disposalState.data.registrant) {
            alert('登録者(学生証)を入力してください（NFC読み取り）');
            return;
        }

        // ★ 管理番号から asset 情報を 1件引いておく
        //    /api/v2/assets?management_number=... を想定
        try {
            const res = await API.assets.fetchList({ management_number: mgmt });
            const list = extractListPayload(res, ['assets', 'results', 'items', 'list', 'rows']);

            if (!list || list.length === 0) {
                alert('該当する備品が見つかりませんでした');
                return;
            }

            if (list.length > 1) {
                console.warn('同じ管理番号で複数件ヒットしました。先頭1件を使用します。', list);
            }

            const asset = list[0];
            disposalState.asset = asset;
            console.log('Resolved asset from mgmt:', mgmt, asset);

            // 確認画面へ
            Router.to('disposal-confirm');
        } catch (e) {
            console.error('asset fetch error:', e);
            const msg =
                (e && e.response && e.response.data && e.response.data.error) ||
                '備品情報の取得に失敗しました';
            alert(msg);
        }
    },

    // 登録実行
    async disposalSubmit() {
        if (disposalState.submitting) {
            return;
        }

        const d = disposalState.data;
        const asset = disposalState.asset;

        if (!d || !asset) {
            alert('廃棄対象の情報が取得できていません。\n入力画面からやり直してください。');
            Router.to('disposal-input');
            return;
        }

        const mgmt = normalizeMgmtInput(d.itemId);
        if (!mgmt) {
            alert('管理番号が不正です');
            return;
        }

        const assetId = asset.id || asset.asset_id;
        if (!assetId) {
            alert('asset_id が特定できませんでした');
            return;
        }

        // 個別管理かどうか（serial 系があれば個別とみなす）
        const isIndividual = !!(asset.serial || asset.serial_number);

        // 数量
        const qtyRaw = d.qty || '1';
        let quantity = parseInt(qtyRaw, 10);
        if (isNaN(quantity) || quantity <= 0) {
            quantity = 1;
        }
        if (isIndividual) {
            quantity = 1; // 個別管理なら常に1
        }

        const payload = {
            asset_id: assetId,
            reason: d.reason,
            processed_by_id: d.registrant,
            quantity: quantity,
            is_individual: isIndividual,
        };

        console.log('Disposal Submit payload:', mgmt, payload);

        disposalState.submitting = true;
        try {
            await API.disposal.register(mgmt, payload);

            // 成功したら state リセット
            disposalState.data = {};
            disposalState.asset = null;

            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('廃棄登録が完了しました');
            } else {
                alert('廃棄登録が完了しました');
                Router.to('disposal-input');
            }
        } catch (e) {
            console.error('Disposal Submit error:', e);
            const msg =
                (e && e.response && e.response.data && e.response.data.error) ||
                '廃棄登録中にエラーが発生しました。';
            alert(msg);
        } finally {
            disposalState.submitting = false;
        }
    },
};

// 画面初期化処理
export function initDisposal(view) {
    if (view === 'input') {
        const form = document.getElementById('form-disposal');
        if (!form) {
            return;
        }

        // state にデータが残っていれば復元（戻るボタンで戻ってきた場合など）
        if (Object.keys(disposalState.data).length > 0) {
            restoreFormData(form, disposalState.data);
        } else {
            // 初回アクセス時だけ今日の日付を自動セット
            const dateInput = form.querySelector('input[name="date"]');
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
                disposalState.data.date = today;
            }
        }
    } else if (view === 'confirm') {
        const display = document.getElementById('disp-confirm-view');
        if (display) {
            const d = disposalState.data;
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${d.itemId || ''}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${d.qty || '1'}</span></div>
                <div class="info-row"><span class="info-label">登録者</span><span>${d.registrant || ''}</span></div>
                <div class="info-row"><span class="info-label">登録日</span><span>${d.date || ''}</span></div>
                <div class="info-row"><span class="info-label">廃棄理由</span><span>${d.reason || ''}</span></div>
            `;
        }
    } else if (view === 'history') {
        const tbody = document.getElementById('disposal-history-body');
        if (tbody) {
            tbody.innerHTML = mockHistory
                .map(function (item) {
                    return (
                        '<tr>' +
                        '<td>' + item.id + '</td>' +
                        '<td>' + item.name + '</td>' +
                        '<td>' + item.reason + '</td>' +
                        '<td>' + item.date + '</td>' +
                        '</tr>'
                    );
                })
                .join('');
        }
    }
}

function restoreFormData(form, data) {
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const input = form.querySelector('[name="' + key + '"]');
        if (input) {
            input.value = data[key];
        }
    }
}
