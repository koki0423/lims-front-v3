import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { scanStudentIdWithRetry } from "../../js/nfcReader.js";
import { AppState } from '../../js/app_state.js';

// =====================================
// 定数・ヘルパ
// =====================================

// 登録時の状態管理
const regState = {
    type: '',       // 'individual' or 'bulk'
    data: {},       // step1,2 で入力された値
    submitting: false,
};

// -------------------------------------
// GENRE 関連ヘルパ
// -------------------------------------

function renderGenreOptions() {
    console.log('Rendering genre options...');
    const select = document.getElementById('reg-genre-select');
    if (!select) return;

    // 現在の選択値を保持（画面を行き来したとき用）
    const currentVal = select.value;

    // 一旦リセット
    select.innerHTML = '<option value="">選択してください</option>';

    // AppStateから有効なジャンルのみ取得してoption生成
    AppState.genres.forEach(g => {
        if (g.is_disabled) return; // 無効なものは表示しない

        const option = document.createElement('option');
        option.value = g.name;
        option.textContent = g.name;

        // 復元処理
        if (currentVal === g.name) option.selected = true;
        select.appendChild(option);
    });
}

function genreByName(name) {
    if (!name) return null;
    return AppState.genres.find(g => g.name === name) || null;
}

function genreById(id) {
    const target = Number(id);
    return AppState.genres.find(g => g.id === target) || null;
}

// -------------------------------------
// payload 組み立て (個別登録用)
// -------------------------------------
function buildPayloadsFromState() {
    const d = regState.data;

    // 必須チェック
    if (!d.itemName) { alert('備品名は必須です。'); return null; }
    if (!d.maker) { alert('メーカー名は必須です。'); return null; }
    if (!d.model) { alert('型番は必須です。（不明な場合は「不明」と入力）'); return null; }
    if (regState.type === 'individual' && !d.serial) { alert('シリアル番号は必須です。'); return null; }
    if (!d.genre) { alert('備品ジャンルは必須です。'); return null; }
    if (!d.location) { alert('標準保管場所 または 所有者は必須です。'); return null; }
    if (!d.purchaseDate) { alert('購入日は必須です。'); return null; }
    if (!d.registrant) { alert('登録者は必須です。'); return null; }

    const genre = genreByName(d.genre);
    if (!genre) { alert('備品ジャンルの値が不正です。'); return null; }

    // 区分: 個別 =1, 一括 =2
    let managementCategoryId = (regState.type === 'individual') ? 1 : (regState.type === 'bulk') ? 2 : null;
    if (!managementCategoryId) { alert('管理方法が選択されていません。'); return null; }

    return {
        master: {
            name: d.itemName,
            management_category_id: managementCategoryId,
            genre_id: genre.id,
            manufacturer: d.maker,
            model: d.model || null,
        },
        asset: {
            serial: regState.type === 'individual' ? (d.serial || null) : null,
            quantity: regState.type === 'bulk' ? Number(d.quantity || 1) : 1,
            purchased_at: d.purchaseDate ? new Date(d.purchaseDate).toISOString() : new Date().toISOString(),
            status_id: 1, // 新規登録時は「正常」
            owner: d.registrant || null,
            default_location: d.location || null,
            notes: d.remarks || null,
        },
        genre,
    };
}

// -------------------------------------
// ラベル印刷 payload (個別登録用)
// -------------------------------------
function getLabelSettingsFromState() {
    const rawCode = regState.data.labelCodeType || 'QR';
    const codeType = rawCode === 'CODE128' ? 'CODE128' : 'QR';
    const tapeWidth = parseInt(regState.data.labelTapeWidth || '9', 10);

    return {
        codeType,
        tapeWidth: isNaN(tapeWidth) ? 9 : tapeWidth,
        halfcut: true, // 強制オン
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
// 登録実行処理 (個別登録API呼び出し)
// -------------------------------------
async function executeRegistration(payloads) {
    // 1) マスタ登録
    const masterRes = await API.assets.createMaster(payloads.master);
    const masterData = masterRes?.data || masterRes;
    const assetMasterId = masterData?.asset_master_id;

    if (!assetMasterId) throw new Error('備品マスタの登録に失敗しました');

    // 2) 個別資産登録
    const assetPayloadWithMasterId = { ...payloads.asset, asset_master_id: assetMasterId };
    const assetRes = await API.assets.createAsset(assetPayloadWithMasterId);
    const assetData = assetRes?.data || assetRes;
    const mgmtNumber = assetData?.management_number;

    if (!mgmtNumber) throw new Error('備品の登録に失敗しました');

    // 3) ラベル印刷
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
        Router.to('reg-input-1');
    },

    // P4 -> P5: 入力画面1保存
    saveStep1() {
        const form = document.getElementById('form-reg-1');
        if (!form || !form.reportValidity()) return;

        const formData = new FormData(form);
        for (const [key, val] of formData.entries()) {
            regState.data[key] = val;
        }
        Router.to('reg-input-2');
    },

    // P5 -> P6: 入力画面2保存
    saveStep2() {
        const form = document.getElementById('form-reg-2');
        if (!form || !form.reportValidity()) return;

        const formData = new FormData(form);
        for (const [key, val] of formData.entries()) {
            regState.data[key] = val;
        }

        const halfcutEl = form.querySelector('input[name="labelHalfcut"]');
        if (halfcutEl) {
            regState.data.labelHalfcut = halfcutEl.checked ? 'on' : 'off';
        }

        Router.to('reg-confirm');
    },

    // NFC読取
    async NfcRead() {
        const input = document.querySelector('input[name="registrant"]');
        try {
            const result = await scanStudentIdWithRetry(9, 2000);
            input.value = result.ok ? result.studentId : "error";
        } catch (err) {
            console.error("scan error:", err);
            input.value = "error";
        }
    },

    // 確認画面からの「登録」ボタン (個別登録フロー)
    async submit() {
        if (regState.submitting) return;
        regState.submitting = true;

        try {
            const payloads = buildPayloadsFromState();
            if (!payloads) return;

            const result = await executeRegistration(payloads);

            if (result.printFailed) {
                alert(`登録完了しましたが印刷に失敗しました。\n管理番号: ${result.managementNumber}`);
            } else {
                alert(`登録＆印刷を実行しました。\n管理番号: ${result.managementNumber}`);
            }

            // リセット＆完了画面へ
            regState.data = {};
            regState.type = '';
            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('新規登録が完了しました');
            }
        } catch (e) {
            console.error('登録エラー:', e);
            const msg = e.response?.data?.error || e.message || '登録に失敗しました';
            alert(`登録に失敗しました。\n${msg}`);
        } finally {
            regState.submitting = false;
        }
    },

    // 一括登録用 CSVアップロード処理
    async uploadCsv() {
        const fileInput = document.getElementById('file-csv');
        const labelType = document.getElementById('labelCodeType').value;
        const tapeWidth = document.getElementById('labelTapeWidth').value;
        const halfcut = document.getElementById('labelHalfcut').checked;

        if (!fileInput || fileInput.files.length === 0) {
            alert('ファイルを選択してください');
            return;
        }
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        try {
            // API送信
            const response = await API.assets.batchRegister('commit', formData);
            console.log('Batch upload response:', response);

            // 次の画面(完了画面)のためにデータを保存
            const printConfig = {
                type: labelType,
                width: tapeWidth,
                halfcut,
            };
            sessionStorage.setItem('last_import_print_config', JSON.stringify(printConfig));
            // サーバーからの結果(results)を保存
            sessionStorage.setItem('last_import_results', JSON.stringify(response.results));

            // 印刷実行
            await this.printImportedLabels();

            Router.to('complete');
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.error || error.message;
            alert('アップロードに失敗しました: ' + msg);
        }
    },

    // 一括登録後のラベル印刷処理
    async printImportedLabels() {
        const configStr = sessionStorage.getItem('last_import_print_config');
        const resultsStr = sessionStorage.getItem('last_import_results');

        if (!configStr || !resultsStr) {
            // データがない場合はスルーして呼び出し元に戻る
            return;
        }

        const config = JSON.parse(configStr);
        const results = JSON.parse(resultsStr);

        // 成功データ(Ok=true)のみ抽出して LabelData に変換
        const labels = results
            .filter(row => row.ok === true)
            .map(row => {
                // ジャンルIDから名前解決
                const genreObj = genreById(row.genre_id);
                const genreName = genreObj ? genreObj.name : 'その他';

                return {
                    checked: true,
                    col_b: row.name || '',              // 備品名
                    col_c: genreName,                   // ジャンル名
                    col_d: row.management_number || '', // QRデータ
                    col_e: row.management_number || ''  // 表示文字
                };
            });

        if (labels.length === 0) {
            alert('登録は完了しましたが、印刷可能なデータがありませんでした');
            return;
        }

        // ここで確認ダイアログ
        if (!confirm(`${labels.length} 件の登録に成功しました。\n続けてラベルを印刷しますか？`)) {
            // キャンセルされたら印刷せず終了（呼び出し元に戻って完了画面へ）
            return;
        }

        const payload = {
            config: {
                use_halfcut: config.halfcut,
                confirm_tape_width: false,
                enable_print_log: true
            },
            width: Number(config.width),
            type: config.type.toLowerCase() === 'code128' ? 'code128' : 'qrcode',
            labels: labels
        };

        try {
            const response = await API.assets.printBatch(payload);
            console.log('Batch print response:', response);
            alert('印刷リクエストを送信しました');

            // データクリア
            sessionStorage.removeItem('last_import_print_config');
            sessionStorage.removeItem('last_import_results');

        } catch (error) {
            console.error('Print error:', error);
            // 印刷失敗しても、登録自体はできているのでアラートだけ出して進む
            alert('印刷に失敗しました: ' + (error.response?.data?.error || error.message) + '\n' + '一覧画面から手動で印刷してください。');
        }
    },

    /* ここからJANコード系 */
    // 手動入力エリアの開閉トグル
    toggleManualInput(forceOpen = false) {
        const manualArea = document.getElementById('manual-input-area');
        const toggleBtn = document.getElementById('toggle-manual-btn');

        if (!manualArea) return;

        // forceOpenがtrue、または現在非表示なら開く
        if (forceOpen || manualArea.style.display === 'none') {
            manualArea.style.display = 'block';
            manualArea.classList.add('fade-in'); // cssのフェードイン効果
            if (toggleBtn) toggleBtn.textContent = '手動入力を閉じる ▲';
        } else {
            manualArea.style.display = 'none';
            if (toggleBtn) toggleBtn.textContent = 'バーコードがない場合はこちら（手動入力） ▼';
        }
    },

    // JANコード検索と自動補完
    async lookupJAN() {
        const janInput = document.getElementById('jan-input');
        const nameInput = document.querySelector('input[name="itemName"]');
        const makerInput = document.querySelector('input[name="maker"]');
        const modelInput = document.querySelector('input[name="model"]');

        if (!janInput) return;
        const janCode = janInput.value.trim();
        if (!janCode) {
            alert('JANコードを入力してください');
            return;
        }
        if (!/^\d+$/.test(janCode)) {
            alert('JAN/ISBNは数字のみ入力してください');
            janInput.focus();
            return;
        }

        const btn = document.getElementById('jan-search-btn');
        if (btn) { btn.disabled = true; btn.textContent = '検索中...'; }

        try {
            const result = await API.assets.lookupJAN(janCode);

            // 取得した値をセット
            if (result.name) nameInput.value = result.name;
            if (result.manufacturer) makerInput.value = result.manufacturer;

            // ★検索成功したら、隠れていたフォームを自動で開く
            this.toggleManualInput(true);

            if (modelInput) modelInput.focus();

        } catch (error) {
            console.error('JAN Lookup Error:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || '商品情報が見つかりませんでした。';
            alert(`検索エラー: ${msg}`);

            // ★見つからなかった場合も手入力してもらうために開く
            this.toggleManualInput(true);
            if (nameInput) nameInput.focus();
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '検索'; }
        }
    },
};

// -------------------------------------
// 入力項目の表示切替 (個別 vs 一括)
// -------------------------------------
function updateInputVisibility() {
    // 現在のモードが一括管理 ('bulk') かどうかチェック
    const isBulk = (regState.type === 'bulk');

    // 操作する要素を取得
    const serialGroup = document.getElementById('group-serial');
    const quantityGroup = document.getElementById('group-quantity');
    const serialInput = document.querySelector('input[name="serial"]');
    const quantityInput = document.querySelector('input[name="quantity"]');

    if (isBulk) {
        // === 一括管理モードの場合 ===
        // シリアル番号: 非表示 & 必須解除
        if (serialGroup) serialGroup.style.display = 'none';
        if (serialInput) serialInput.required = false;

        // 数量: 表示 & 必須化
        if (quantityGroup) quantityGroup.style.display = 'block';
        if (quantityInput) quantityInput.required = true;

    } else {
        // === 個別管理モードの場合 ===
        // シリアル番号: 表示 & 必須化
        if (serialGroup) serialGroup.style.display = 'block';
        if (serialInput) serialInput.required = true;

        // 数量: 非表示 & 必須解除
        if (quantityGroup) quantityGroup.style.display = 'none';
        if (quantityInput) quantityInput.required = false;
    }
}

// =====================================
// Router から呼ばれる初期化フック
// =====================================
export function initRegistration(step) {
    if (step === 'step1') {
        renderGenreOptions();
        updateInputVisibility();
        const form = document.getElementById('form-reg-1');
        if (form && regState.data) restoreFormData(form, regState.data);

        // 画面表示後にJANコード入力欄へ自動フォーカス
        setTimeout(() => {
            const janInput = document.getElementById('jan-input');
            if (!janInput) return;

            // 一度だけバリデーションを仕込む（画面行き来で多重登録しない）
            if (!janInput.dataset.janValidated) {
                janInput.dataset.janValidated = '1';

                const sanitizeDigits = () => {
                    // 1) 全角数字→半角数字に寄せる（よくある事故対策）
                    let v = janInput.value;
                    v = v.replace(/[０-９]/g, function (ch) {
                        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
                    });

                    // 2) 数字以外を除去
                    const cleaned = v.replace(/[^0-9]/g, '');
                    const hadInvalid = (cleaned !== v);

                    janInput.value = cleaned;

                    // 3) エラー表示（HTML標準のバリデーション機構を利用）
                    if (hadInvalid) {
                        janInput.setCustomValidity('JAN/ISBNは数字のみ入力できます（半角推奨）');
                    } else {
                        janInput.setCustomValidity('');
                    }
                };

                // 入力のたびにサニタイズ
                janInput.addEventListener('input', sanitizeDigits);

                // フォーカス外れたら、エラーがあれば吹き出し表示（標準UI）
                janInput.addEventListener('blur', function () {
                    sanitizeDigits();
                    if (!janInput.checkValidity()) {
                        janInput.reportValidity();
                    }
                });
            }

            janInput.focus();
        }, 100);
    }
    if (step === 'step2') {
        const form = document.getElementById('form-reg-1');
        if (form) restoreFormData(form, regState.data);
    } else if (step === 'step3') {
        const form = document.getElementById('form-reg-2');
        if (form) restoreFormData(form, regState.data);
    } else if (step === 'confirm') {
        renderConfirm();
    }
}

// -------------------------------------
// フォーム復元ヘルパ
// -------------------------------------
function restoreFormData(form, data) {
    Object.keys(data).forEach(key => {
        const input = form.querySelector('[name="' + key + '"]');
        if (input) input.value = data[key];
    });
}

// -------------------------------------
// 確認画面描画 (個別登録用)
// -------------------------------------
function renderConfirm() {
    const display = document.getElementById('confirm-display');
    if (!display) return;

    const d = regState.data;
    const typeLabel = regState.type === 'individual' ? '個別管理' : '一括管理';
    const codeTypeLabel = (d.labelCodeType === 'CODE128') ? 'バーコード(Code128)' : 'QRコード';
    const tapeWidth = d.labelTapeWidth || '9';
    const halfcutOn = d.labelHalfcut === 'on';

    display.innerHTML = `
        <div class="info-row"><span class="info-label">管理方法</span><span>${typeLabel}</span></div>
        <div class="info-row"><span class="info-label">備品名</span><span>${d.itemName || ''}</span></div>
        <div class="info-row"><span class="info-label">メーカー</span><span>${d.maker || ''}</span></div>
        <div class="info-row"><span class="info-label">型番</span><span>${d.model || '-'}</span></div>
        <div class="info-row"><span class="info-label">シリアル</span><span>${d.serial || '-'}</span></div>
        <div class="info-row"><span class="info-label">ジャンル</span><span>${d.genre || ''}</span></div>
        <div class="info-row"><span class="info-label">保管場所</span><span>${d.location || ''}</span></div>
        <div class="info-row"><span class="info-label">購入日</span><span>${d.purchaseDate || ''}</span></div>
        <div class="info-row"><span class="info-label">登録者</span><span>${d.registrant || ''}</span></div>
        <div class="info-row"><span class="info-label">備考</span><span>${d.remarks || ''}</span></div>
        <div class="info-row"><span class="info-label">ラベル種別</span><span>${codeTypeLabel}</span></div>
        <div class="info-row"><span class="info-label">テープ幅</span><span>${tapeWidth} mm</span></div>
        <div class="info-row"><span class="info-label">ハーフカット</span><span>${halfcutOn ? 'あり' : 'なし'}</span></div>
    `;
}