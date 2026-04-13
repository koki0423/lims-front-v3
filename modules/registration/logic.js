import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml, toLocalDateTimeIso } from '../../js/dom_utils.js';

// =====================================
// 定数・ヘルパ
// =====================================

// 登録時の状態管理
const regState = {
    type: '',       // 'individual' or 'bulk'
    data: {},       // step1,2 で入力された値
    submitting: false,
};

const batchImportState = {
    printConfig: null,
    results: null,
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

function clearBatchImportState() {
    batchImportState.printConfig = null;
    batchImportState.results = null;

    sessionStorage.removeItem('last_import_print_config');
    sessionStorage.removeItem('last_import_results');
}

function hasStep1Data() {
    const keys = ['itemName', 'maker', 'model', 'serial', 'quantity', 'genre'];
    return keys.some(key => {
        const value = regState.data[key];
        return value !== undefined && value !== null && String(value) !== '';
    });
}

function getManualInputArea() {
    return document.getElementById('manual-input-area');
}

function isManualInputOpen() {
    const manualArea = getManualInputArea();
    return Boolean(manualArea) && manualArea.style.display !== 'none';
}

function syncManualInputControls(isOpen) {
    const manualArea = getManualInputArea();
    if (!manualArea) return;

    manualArea.querySelectorAll('input, select, textarea').forEach(control => {
        control.disabled = !isOpen;
    });
}

function setManualInputOpen(isOpen) {
    const manualArea = getManualInputArea();
    const toggleBtn = document.getElementById('toggle-manual-btn');
    if (!manualArea) return;

    manualArea.style.display = isOpen ? 'block' : 'none';
    if (isOpen) {
        manualArea.classList.add('fade-in');
    }

    syncManualInputControls(isOpen);
    updateInputVisibility();

    if (toggleBtn) {
        toggleBtn.textContent = isOpen
            ? '手動入力を閉じる ▲'
            : 'バーコードがない場合はこちら（手動入力） ▼';
    }
}

function buildBatchLabels(results) {
    return results
        .filter(row => row.ok === true)
        .map(row => {
            const genreObj = genreById(row.genre_id);
            const genreName = genreObj ? genreObj.name : 'その他';

            return {
                checked: true,
                col_b: row.name || '',
                col_c: genreName,
                col_d: row.management_number || '',
                col_e: row.management_number || ''
            };
        });
}

function ensureRegistrantInputValidation() {
    const input = document.querySelector('input[name="registrant"]');
    if (!input || input.dataset.nfcValidationBound === '1') return input;

    input.dataset.nfcValidationBound = '1';
    input.addEventListener('input', () => {
        input.setCustomValidity('');
    });

    return input;
}

// -------------------------------------
// テプラのテンプレートダウンロード
// -------------------------------------
async function downloadTemplateFile(width, type) {
    try {
        const blob = await API.assets.downloadTemplate(width, type);
        const filename = width + '_' + type + '.lw1';
        return new File([blob], filename, { type: 'application/octet-stream' });
    } catch (error) {
        const message =
            error.response?.data?.error?.message ||
            error.message ||
            'テンプレートの取得に失敗しました';

        throw new Error(message);
    }
}

// =====================================
// CSVの作成
// =====================================
function escapeCsvValue(value) {
    const s = value == null ? '' : String(value);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function buildCsvFileFromLabels(labels) {
    const lines = [];

    for (const row of labels) {
        if (!row || row.checked !== true) {
            continue;
        }

        const cols = [
            escapeCsvValue(row.col_b),
            escapeCsvValue(row.col_c),
            escapeCsvValue(row.col_d),
            escapeCsvValue(row.col_e)
        ];

        lines.push(cols.join(','));
    }

    const csvText = lines.join('\r\n');
    const bom = '\uFEFF';
    return new File([bom, csvText], 'labels.csv', { type: 'text/csv;charset=utf-8' });
}

function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
            continue;
        }

        current += ch;
    }

    result.push(current);
    return result;
}

function parseSimpleCsv(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const rows = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === '') {
            continue;
        }
        rows.push(splitCsvLine(line));
    }

    return rows;
}

function stringifyCsv(rows) {
    const lines = [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const cols = [];

        for (let j = 0; j < row.length; j += 1) {
            cols.push(escapeCsvValue(row[j]));
        }

        lines.push(cols.join(','));
    }

    return lines.join('\r\n');
}

function normalizeFullWidthDigits(value) {
    if (value == null) {
        return '';
    }

    return String(value).replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
}

function cleanCell(value) {
    if (value == null) {
        return '';
    }

    return String(value).trim();
}

function parseTemplateRows(fileText) {
    const rows = parseSimpleCsv(fileText);
    if (rows.length === 0) {
        throw new Error('CSVが空です');
    }

    let headerIndex = -1;
    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const joined = row.join(',');
        if (joined.includes('備品名') && joined.includes('管理区分')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex < 0) {
        throw new Error('テンプレートのヘッダ行が見つかりません');
    }

    const headerRow = rows[headerIndex];
    const dataRows = [];
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
        dataRows.push(rows[i]);
    }

    return {
        headerRow,
        dataRows
    };
}

function findHeaderIndexMap(headerRow) {
    const indexMap = {};

    for (let i = 0; i < headerRow.length; i += 1) {
        const key = cleanCell(headerRow[i]);
        if (key !== '') {
            indexMap[key] = i;
        }
    }

    return indexMap;
}

function getCellByHeader(row, indexMap, headerName) {
    const idx = indexMap[headerName];
    if (idx == null) {
        return '';
    }
    return cleanCell(row[idx]);
}

function toImportRfc3339(value) {
    const v = normalizeFullWidthDigits(cleanCell(value));
    if (v === '') {
        throw new Error('購入日が空です');
    }

    const m = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!m) {
        throw new Error('購入日の形式が不正です: ' + value);
    }

    const year = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');

    return year + '-' + month + '-' + day + 'T00:00:00+09:00';
}

function managementCategoryLabelToId(value) {
    const v = cleanCell(value);

    if (v === '個別管理') {
        return '1';
    }
    if (v === '一括管理') {
        return '2';
    }

    throw new Error('管理区分が不正です: ' + value);
}

function resolveGenreIdByName(name) {
    const genreName = cleanCell(name);
    const genre = genreByName(genreName);

    if (!genre) {
        throw new Error('備品ジャンルが不正です: ' + name);
    }

    return String(genre.id);
}

function toPositiveIntegerString(value, fallbackValue) {
    const raw = normalizeFullWidthDigits(cleanCell(value));
    if (raw === '') {
        return String(fallbackValue);
    }

    const num = Number(raw);
    if (!Number.isInteger(num) || num < 0) {
        throw new Error('個数が不正です: ' + value);
    }

    return String(num);
}

async function buildImportCsvFromTemplateFile(file) {
    await AppState.ensureMasterData();

    const text = await file.text();
    const parsed = parseTemplateRows(text);
    const headerRow = parsed.headerRow;
    const dataRows = parsed.dataRows;
    const indexMap = findHeaderIndexMap(headerRow);

    const outputRows = [];
    outputRows.push([
        'name',
        'management_category_id',
        'genre_id',
        'manufacturer',
        'model',
        'serial',
        'quantity',
        'purchased_at',
        'status_id',
        'owner',
        'default_location',
        'location',
        'last_checked_at',
        'last_checked_by',
        'notes'
    ]);

    for (let i = 0; i < dataRows.length; i += 1) {
        const row = dataRows[i];

        const name = getCellByHeader(row, indexMap, '備品名');
        const managementCategory = getCellByHeader(row, indexMap, '管理区分');
        const manufacturer = getCellByHeader(row, indexMap, 'メーカー');
        const model = getCellByHeader(row, indexMap, '型番');
        const serial = getCellByHeader(row, indexMap, 'シリアル番号');
        const quantity = getCellByHeader(row, indexMap, '個数');
        const ownerOrLocation = getCellByHeader(row, indexMap, '保管場所（所有者）');
        const genreName = getCellByHeader(row, indexMap, '備品ジャンル');
        const purchasedAt = getCellByHeader(row, indexMap, '購入日(yyyy/mm/dd)');
        const notes = getCellByHeader(row, indexMap, '備考');

        const isEmptyRow =
            name === '' &&
            managementCategory === '' &&
            manufacturer === '' &&
            model === '' &&
            serial === '' &&
            quantity === '' &&
            ownerOrLocation === '' &&
            genreName === '' &&
            purchasedAt === '' &&
            notes === '';

        if (isEmptyRow) {
            continue;
        }

        const managementCategoryId = managementCategoryLabelToId(managementCategory);
        const genreId = resolveGenreIdByName(genreName);
        const quantityValue = toPositiveIntegerString(quantity, 1);
        const purchasedAtValue = toImportRfc3339(purchasedAt);

        outputRows.push([
            name,
            managementCategoryId,
            genreId,
            manufacturer,
            model,
            serial,
            quantityValue,
            purchasedAtValue,
            '1',
            ownerOrLocation,
            ownerOrLocation,
            '',
            '',
            '',
            notes
        ]);
    }

    if (outputRows.length === 1) {
        throw new Error('登録対象のデータ行がありません');
    }

    const csvText = stringifyCsv(outputRows);

    return new File([csvText], 'assets_import.csv', { type: 'text/csv;charset=utf-8' });
}

// =====================================
// テープ幅をIDへ変換
// =====================================
function getTapeIdFromWidth(width) {
    const w = Number(width);

    switch (w) {
        case 4:
            return window.TepraPrintTapeID._04MMTAPE;
        case 6:
            return window.TepraPrintTapeID._06MMTAPE;
        case 9:
            return window.TepraPrintTapeID._09MMTAPE;
        case 12:
            return window.TepraPrintTapeID._12MMTAPE;
        case 18:
            return window.TepraPrintTapeID._18MMTAPE;
        case 24:
            return window.TepraPrintTapeID._24MMTAPE;
        case 36:
            return window.TepraPrintTapeID._36MMTAPE;
        default:
            throw new Error('未対応のテープ幅です: ' + width);
    }
}

// =====================================
// フロントで印刷実行
// =====================================
async function printLabelsWithTepra(labels, width, type, halfcut) {
    if (!window.TepraPrint || !window.TepraPrintError) {
        throw new Error('TepraPrintライブラリが読み込まれていません');
    }

    const templateFile = await downloadTemplateFile(width, type);
    const csvFile = buildCsvFileFromLabels(labels);

    const printerResult = await window.TepraPrint.createPrinter();
    if (printerResult.errorCode !== window.TepraPrintError.SUCCESS) {
        throw new Error('プリンタの取得に失敗しました: errorCode=' + printerResult.errorCode);
    }

    const printer = printerResult.printer;

    const onlineResult = await window.TepraPrint.checkPrinterOnline(printer.printerName);
    if (onlineResult.errorCode !== window.TepraPrintError.SUCCESS) {
        throw new Error('プリンタ状態の確認に失敗しました: errorCode=' + onlineResult.errorCode);
    }
    if (!onlineResult.isOnline) {
        throw new Error('テプラプリンタがオフラインです');
    }

    const paramResult = await printer.createPrintParameter();
    if (paramResult.errorCode !== window.TepraPrintError.SUCCESS) {
        throw new Error('印刷パラメータ生成に失敗しました');
    }

    const printParameter = paramResult.printParameter;
    printParameter.tape = getTapeIdFromWidth(width);
    printParameter.halfCut = Boolean(halfcut);
    printParameter.tapeCut = window.TepraPrintTapeCut.EACH_LABEL;
    printParameter.displayTapeWidth = false;
    printParameter.displayPrintSetting = false;
    printParameter.displayError = true;
    printParameter.previewImage = false;
    printParameter.skipRecord = false;

    const printFile = {
        templateFile: templateFile,
        csvFile: csvFile
    };

    const printResult = await printer.doPrint(printParameter, printFile);
    if (printResult.errorCode !== window.TepraPrintError.SUCCESS) {
        throw new Error('印刷開始に失敗しました: errorCode=' + printResult.errorCode);
    }

    return printResult.printJob;
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
            purchased_at: d.purchaseDate ? toLocalDateTimeIso(d.purchaseDate) : toLocalDateTimeIso(new Date()),
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
        const label = getLabelSettingsFromState();
        const type = label.codeType === 'QR' ? 'qrcode' : 'code128';
        const row = buildSingleLabelRow(payloads.master, mgmtNumber);

        await printLabelsWithTepra(
            [row],
            label.tapeWidth,
            type,
            label.halfcut
        );

    } catch (e) {
        console.error('印刷エラー:', e);
        printFailed = true;
        printError = e;
    }

    return { managementNumber: mgmtNumber, printFailed, printError };
}

function buildSingleLabelRow(masterPayload, managementNumber) {
    const g = genreById(masterPayload.genre_id);

    return {
        checked: true,
        col_b: masterPayload.name,
        col_c: g ? g.name : '-',
        col_d: managementNumber,
        col_e: managementNumber
    };
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
        if (!form) return;

        if (!isManualInputOpen()) {
            setManualInputOpen(true);
        }
        if (!form.reportValidity()) return;

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
        const input = ensureRegistrantInputValidation();
        if (!input) return;

        try {
            const { scanStudentIdWithRetry } = await loadNfcReader();
            const result = await scanStudentIdWithRetry(9, 2000);
            if (!result?.ok || !result.studentId) {
                throw new Error('学生証の読み取りに失敗しました');
            }

            input.value = result.studentId;
            input.setCustomValidity('');
        } catch (err) {
            console.error('scan error:', err);
            input.value = '';
            input.setCustomValidity('NFCの読み取りに失敗しました。手入力するか再度お試しください。');
            input.reportValidity();
            input.focus();
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
                alert(`登録完了、印刷を開始しました。\n管理番号: ${result.managementNumber}`);
            }

            regState.data = {};
            regState.type = '';

            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('新規登録が完了しました');
            } else {
                Router.to('complete');
            }
        } catch (e) {
            console.error('登録エラー:', e);
            const msg = e.response?.data?.error || e.message || '登録に失敗しました';
            alert(`登録に失敗しました。\n${msg}`);
        } finally {
            regState.submitting = false;
        }
    },

    // 一括登録用のテンプレートダウンロード
    downloadBatchTemplate() {
        const files = [
            {
                href: '/assets/templates/batch_register_guide.xlsx',
                download: '一括登録説明書.xlsx'
            },
            {
                href: '/assets/templates/batch_register_template.csv',
                download: '一括登録テンプレート.csv'
            }
        ];

        for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            const link = document.createElement('a');
            link.href = file.href;
            link.download = file.download;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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

        const originalFile = fileInput.files[0];

        let importFile;
        try {
            importFile = await buildImportCsvFromTemplateFile(originalFile);
        } catch (error) {
            console.error('CSV変換エラー:', error);
            alert('CSVの変換に失敗しました: ' + (error.message || 'テンプレート内容を確認してください'));
            return;
        }

        const formData = new FormData();
        formData.append('file', importFile);

        let response;
        try {
            response = await API.assets.batchRegister('commit', formData);
        } catch (error) {
            console.error(error);
            const msg =
                error.response?.data?.error?.message ||
                error.response?.data?.error ||
                error.message;
            alert('一括登録に失敗しました: ' + msg);
            return;
        }

        console.log('Batch upload response:', response);

        batchImportState.printConfig = {
            type: labelType,
            width: tapeWidth,
            halfcut,
        };
        batchImportState.results = Array.isArray(response?.results) ? response.results : [];
        console.log('sending converted file:', importFile);

        try {
            await this.printImportedLabels();
        } catch (error) {
            console.error('Post-commit print preparation error:', error);
            alert(
                '登録は完了しましたが、印刷準備でエラーが発生しました。\n'
                + (error.message || '一覧画面から手動で印刷してください。')
            );
        } finally {
            clearBatchImportState();
        }

        if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
            CommonController.showComplete('一括登録が完了しました');
        } else {
            Router.to('complete');
        }
    },

    // 一括登録後のラベル印刷処理
    async printImportedLabels() {
        const config = batchImportState.printConfig;
        const results = batchImportState.results;
        if (!config || !Array.isArray(results)) {
            return;
        }

        const labels = buildBatchLabels(results);

        if (labels.length === 0) {
            alert('登録は完了しましたが、印刷可能なデータがありませんでした');
            return;
        }

        // ここで確認ダイアログ
        if (!confirm(`${labels.length} 件の登録に成功しました。\n続けてラベルを印刷しますか？`)) {
            // キャンセルされたら印刷せず終了（呼び出し元に戻って完了画面へ）
            return;
        }

        const type = config.type.toLowerCase() === 'code128' ? 'code128' : 'qrcode';

        try {
            const printJob = await printLabelsWithTepra(
                labels,
                Number(config.width),
                type,
                true // ハーフカットは強制オン
            );

            console.log('Batch print started:', printJob);
            alert('印刷を開始しました');
        } catch (error) {
            console.error('Print error:', error);
            alert(
                '印刷に失敗しました: '
                + (error.response?.data?.error || error.message)
                + '\n一覧画面から手動で印刷してください。'
            );
        }
    },

    /* ここからJANコード系 */
    // 手動入力エリアの開閉トグル
    toggleManualInput(forceOpen = false) {
        setManualInputOpen(forceOpen || !isManualInputOpen());
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
export async function initRegistration(step) {
    if (step === 'step1') {
        await AppState.ensureMasterData();
        renderGenreOptions();
        const form = document.getElementById('form-reg-1');
        if (form && regState.data) restoreFormData(form, regState.data);
        setManualInputOpen(hasStep1Data());

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
    } else if (step === 'step2') {
        const form = document.getElementById('form-reg-1');
        if (form) restoreFormData(form, regState.data);
    } else if (step === 'step3') {
        const form = document.getElementById('form-reg-2');
        if (form) restoreFormData(form, regState.data);
        ensureRegistrantInputValidation();
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
        if (!input) return;

        if (input.type === 'checkbox') {
            input.checked = data[key] === true || data[key] === 'on';
            return;
        }

        input.value = data[key];
    });
}

function createConfirmRow(label, value) {
    const row = document.createElement('div');
    row.className = 'info-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'info-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);

    return row;
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
    const halfcutOn = true;

    display.replaceChildren(
        createConfirmRow('管理方法', typeLabel),
        createConfirmRow('備品名', d.itemName || ''),
        createConfirmRow('メーカー', d.maker || ''),
        createConfirmRow('型番', d.model || '-'),
        createConfirmRow('シリアル', d.serial || '-'),
        createConfirmRow('ジャンル', d.genre || ''),
        createConfirmRow('保管場所', d.location || ''),
        createConfirmRow('購入日', d.purchaseDate || ''),
        createConfirmRow('登録者', d.registrant || ''),
        createConfirmRow('備考', d.remarks || ''),
        createConfirmRow('ラベル種別', codeTypeLabel),
        createConfirmRow('テープ幅', `${tapeWidth} mm`),
        createConfirmRow('ハーフカット', halfcutOn ? 'あり' : 'なし')
    );
}
