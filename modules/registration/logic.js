import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';

// =====================================
// 定数・ヘルパ
// =====================================

// ジャンル定義
const GENRES = [
    { id: 1, code: 'IND', name: '個人' },
    { id: 2, code: 'OFS', name: '事務' },
    { id: 3, code: 'FAC', name: 'ファシリティ' },
    { id: 4, code: 'EMB', name: '組込みシステム' },
    { id: 5, code: 'ADV', name: '高度情報演習' },
];

// 登録時の状態管理
const regState = {
    type: '',       // 'individual' or 'bulk'
    data: {},       // step1,2 で入力された値
    submitting: false,
};

// -------------------------------------
// GENRE 関連ヘルパ
// -------------------------------------
function genreByName(name) {
    if (!name) {
        return null;
    }
    for (let i = 0; i < GENRES.length; i++) {
        if (GENRES[i].name === name) {
            return GENRES[i];
        }
    }
    return null;
}

function genreById(id) {
    const target = Number(id);
    for (let i = 0; i < GENRES.length; i++) {
        if (GENRES[i].id === target) {
            return GENRES[i];
        }
    }
    return null;
}

// -------------------------------------
// 日付表示用フォーマット
// -------------------------------------
function formatDate(ymd) {
    if (!ymd) {
        return '';
    }
    const s = String(ymd);
    const parts = s.split('-');
    if (parts.length !== 3) {
        return s;
    }
    return parts[0] + '/' + parts[1] + '/' + parts[2];
}

// -------------------------------------
// payload 組み立て
// -------------------------------------
function buildPayloadsFromState() {
    const d = regState.data;

    // 必須チェック（旧 Register.js とほぼ同じ）
    if (!d.itemName) {
        alert('備品名は必須です。');
        return null;
    }
    if (!d.maker) {
        alert('メーカー名は必須です。');
        return null;
    }
    if (!d.model) {
        alert('型番は必須です。（不明な場合は「不明」と入力）');
        return null;
    }
    if (regState.type === 'individual' && !d.serial) {
        alert('シリアル番号は必須です。（不明な場合は「不明」と入力）');
        return null;
    }
    if (!d.genre) {
        alert('備品ジャンルは必須です。');
        return null;
    }
    if (!d.location) {
        alert('標準保管場所 または 所有者は必須です。');
        return null;
    }
    if (!d.purchaseDate) {
        alert('購入日は必須です。');
        return null;
    }
    if (!d.registrant) {
        alert('登録者は必須です。');
        return null;
    }

    const genre = genreByName(d.genre);
    if (!genre) {
        alert('備品ジャンルの値が不正です。');
        return null;
    }

    // 区分: 個別 =1, 一括 =2
    let managementCategoryId = null;
    if (regState.type === 'individual') {
        managementCategoryId = 1;
    } else if (regState.type === 'bulk') {
        managementCategoryId = 2;
    } else {
        alert('管理方法が選択されていません。');
        return null;
    }

    // === マスタ用 payload ===
    const masterPayload = {
        name: d.itemName,
        management_category_id: managementCategoryId,
        genre_id: genre.id,
        manufacturer: d.maker,
        model: d.model || null,
    };

    // === 個別資産用 payload ===
    const assetPayload = {
        serial: regState.type === 'individual' ? (d.serial || null) : null,
        quantity: regState.type === 'bulk' ? Number(d.quantity || 1) : 1,
        purchased_at: d.purchaseDate
            ? new Date(d.purchaseDate).toISOString()
            : new Date().toISOString(),
        status_id: 1, // 新規登録時は「正常」
        owner: d.registrant || null,          // 登録者を owner に入れる
        default_location: d.location || null, // 保管場所
        notes: d.remarks || null,
    };

    return {
        master: masterPayload,
        asset: assetPayload,
        genre,
    };
}

// -------------------------------------
// ラベル印刷 payload
// -------------------------------------
function getLabelSettingsFromState() {
    const rawCode = regState.data.labelCodeType || 'QR';
    const codeType = rawCode === 'CODE128' ? 'CODE128' : 'QR';

    const rawWidth = regState.data.labelTapeWidth || '9';
    let tapeWidth = parseInt(rawWidth, 10);
    if (isNaN(tapeWidth)) {
        tapeWidth = 9;
    }

    const halfcutOn = regState.data.labelHalfcut === 'on';
    halfcutOn=true; // 強制オン

    return {
        codeType,
        tapeWidth,
        halfcut: halfcutOn,
    };
}

function buildPrintPayload(masterPayload, managementNumber) {
    const label = getLabelSettingsFromState();
    const type = label.codeType === 'QR' ? 'qrcode' : 'code128';

    const g = genreById(masterPayload.genre_id);

    return {
        config: {
            use_halfcut: label.halfcut,
            confirm_tape_width: false,
            enable_print_log: true,
        },
        label: {
            checked: true,
            col_b: masterPayload.name,
            col_c: g ? g.name : '-',
            col_d: managementNumber,
            col_e: managementNumber,
        },
        width: label.tapeWidth,
        type,
    };
}


// -------------------------------------
// 登録処理
// -------------------------------------
async function executeRegistration(payloads) {
    // 1) マスタ登録
    const masterRes = await API.assets.createMaster(payloads.master);
    const masterData = masterRes && masterRes.data ? masterRes.data : masterRes;
    const assetMasterId = masterData && masterData.asset_master_id;

    if (!assetMasterId) {
        throw new Error('備品マスタの登録に失敗しました（asset_master_id が取得できません）');
    }

    // 2) 個別資産登録
    const assetPayloadWithMasterId = {
        ...payloads.asset,
        asset_master_id: assetMasterId,
    };

    const assetRes = await API.assets.createAsset(assetPayloadWithMasterId);
    const assetData = assetRes && assetRes.data ? assetRes.data : assetRes;
    const mgmtNumber = assetData && assetData.management_number;

    if (!mgmtNumber) {
        throw new Error('備品の登録に失敗しました（management_number が取得できません）');
    }

    // 3) ラベル印刷（失敗しても DB 登録は成功扱い）
    let printFailed = false;
    let printError = null;
    try {
        const printPayload = buildPrintPayload(payloads.master, mgmtNumber);
        await API.assets.printLabel(printPayload);
    } catch (e) {
        console.error('印刷エラー:', e);
        printFailed = true;
        printError = e;
    }

    return { managementNumber: mgmtNumber, printFailed, printError };
}

// =====================================
// HTML から呼ぶコントローラ
// =====================================
window.RegController = {
    // P3: 管理方法選択
    setType(type) {
        regState.type = type; // 'individual' or 'bulk'
        console.log('Selected Type:', type);
        Router.to('reg-input-1');
    },

    // P4 -> P5: 入力画面1の保存と遷移
    saveStep1() {
        const form = document.getElementById('form-reg-1');
        if (!form || !form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        for (const pair of formData.entries()) {
            const key = pair[0];
            const val = pair[1];
            regState.data[key] = val;
        }

        console.log('Step1 Data:', regState.data);
        Router.to('reg-input-2');
    },

    // P5 -> P6: 入力画面2の保存と遷移
    saveStep2() {
        const form = document.getElementById('form-reg-2');
        if (!form || !form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        for (const pair of formData.entries()) {
            const key = pair[0];
            const val = pair[1];
            regState.data[key] = val;
        }

        const halfcutEl = form.querySelector('input[name="labelHalfcut"]');
        if (halfcutEl) {
            regState.data.labelHalfcut = halfcutEl.checked ? 'on' : 'off';
        }

        console.log('Step2 Data:', regState.data);
        Router.to('reg-confirm');
    },


    // モック用: NFCボタンの挙動
    mockNfcRead() {
        const input = document.querySelector('input[name="registrant"]');
        if (input) {
            input.value = 'AB12345 (NFC)';
        }
        alert('NFCカードを読み取りました（モック）');
    },

    // 確認画面からの「登録」ボタン
    async submit() {
        if (regState.submitting) {
            return;
        }
        regState.submitting = true;

        try {
            const payloads = buildPayloadsFromState();
            if (!payloads) {
                regState.submitting = false;
                return;
            }

            const result = await executeRegistration(payloads);

            if (result.printFailed) {
                const msg =
                    '登録は完了しましたが、ラベル印刷に失敗しました。\n' +
                    `管理番号: ${result.managementNumber}`;
                alert(msg);
            } else {
                alert(`登録＆印刷を実行しました。\n管理番号: ${result.managementNumber}`);
            }

            console.log('Final Submit:', regState, payloads, result);

            // 状態リセット
            regState.data = {};
            regState.type = '';

            // 完了表示（共通コンポーネント前提）
            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('新規登録が完了しました');
            }
        } catch (e) {
            console.error('登録エラー:', e);
            const msg =
                (e && e.response && e.response.data && e.response.data.error) ||
                e.message ||
                '登録に失敗しました';
            alert('登録に失敗しました。\n' + msg);
        } finally {
            regState.submitting = false;
        }
    },
};

// =====================================
// Router から呼ばれる初期化フック
// =====================================
export function initRegistration(step) {
    console.log(`Initializing ${step}...`, regState.data);

    if (step === 'step2') {
        // Step1 のデータをフォームに埋め戻す
        const form = document.getElementById('form-reg-1');
        if (form) {
            restoreFormData(form, regState.data);
        }
    } else if (step === 'step3') {
        // Step2 のデータをフォームに埋め戻す
        const form = document.getElementById('form-reg-2');
        if (form) {
            restoreFormData(form, regState.data);
        }
    } else if (step === 'confirm') {
        // 確認画面描画
        renderConfirm();
    }
}

// -------------------------------------
// フォーム復元ヘルパ
// -------------------------------------
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

// -------------------------------------
// 確認画面描画
// -------------------------------------
function renderConfirm() {
    const display = document.getElementById('confirm-display');
    if (!display) {
        return;
    }

    const d = regState.data;

    const typeLabel = regState.type === 'individual' ? '個別管理' : '一括管理';
    const codeTypeRaw = regState.data.labelCodeType || 'QR';
    const codeTypeLabel = codeTypeRaw === 'CODE128' ? 'バーコード(Code128)' : 'QRコード';

    const tapeWidth = regState.data.labelTapeWidth || '9';
    const halfcutOn = regState.data.labelHalfcut === 'on';

    const genre = genreByName(d.genre);

    display.innerHTML = `
        <div class="info-row"><span class="info-label">管理方法</span><span>${typeLabel}</span></div>
        <div class="info-row"><span class="info-label">備品名</span><span>${regState.data.itemName || ''}</span></div>
        <div class="info-row"><span class="info-label">メーカー</span><span>${regState.data.maker || ''}</span></div>
        <div class="info-row"><span class="info-label">型番</span><span>${regState.data.model || '-'}</span></div>
        <div class="info-row"><span class="info-label">シリアル</span><span>${regState.data.serial || '-'}</span></div>
        <div class="info-row"><span class="info-label">ジャンル</span><span>${regState.data.genre || ''}</span></div>
        <div class="info-row"><span class="info-label">保管場所</span><span>${regState.data.location || ''}</span></div>
        <div class="info-row"><span class="info-label">購入日</span><span>${regState.data.purchaseDate || ''}</span></div>
        <div class="info-row"><span class="info-label">登録者</span><span>${regState.data.registrant || ''}</span></div>
        <div class="info-row"><span class="info-label">備考</span><span>${regState.data.remarks || ''}</span></div>
        <div class="info-row"><span class="info-label">ラベル種別</span><span>${codeTypeLabel}</span></div>
        <div class="info-row"><span class="info-label">テープ幅</span><span>${tapeWidth} mm</span></div>
        <div class="info-row"><span class="info-label">ハーフカット</span><span>${halfcutOn ? 'あり' : 'なし'}</span></div>
    `;
}
