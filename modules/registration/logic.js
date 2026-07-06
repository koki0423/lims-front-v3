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

const BATCH_PREVIEW_DEFAULT_MESSAGE = 'CSVを選択して「プレビューを作成」を押してください。';
const SIMPLE_INPUT_DEFAULT_MESSAGE = '共通項目と明細を入力して「プレビューを作成」を押してください。';
const TABLE_INPUT_DEFAULT_MESSAGE = '表に入力して「プレビューを作成」を押してください。';

const BATCH_TEMPLATE_FIELDS = [
    { key: 'name', label: '備品名' },
    { key: 'managementType', label: '管理区分' },
    { key: 'manufacturer', label: 'メーカー' },
    { key: 'modelNumber', label: '型番' },
    { key: 'serialNumber', label: 'シリアル番号' },
    { key: 'quantity', label: '個数' },
    { key: 'storageLocation', label: '保管場所（所有者）' },
    { key: 'genre', label: '備品ジャンル' },
    { key: 'purchaseDate', label: '購入日' },
    { key: 'note', label: '備考' },
];

const batchImportState = {
    sourceFileName: '',
    rows: [],
    validation: null,
    importFile: null,
    statusMessage: BATCH_PREVIEW_DEFAULT_MESSAGE,
    statusTone: 'info',
    printConfig: null,
    results: null,
    committing: false,
};

let simpleDetailRowSequence = 1;
let tableRowSequence = 1;

function createDefaultSimpleCommonFields() {
    return {
        managementType: 'individual',
        manufacturer: '',
        modelNumber: '',
        storageLocation: '',
        genre: '',
        purchaseDate: ''
    };
}

function createSimpleDetailRow() {
    return {
        id: simpleDetailRowSequence++,
        name: '',
        serialNumber: '',
        quantity: '',
        note: ''
    };
}

const simpleBatchState = {
    common: createDefaultSimpleCommonFields(),
    rows: [createSimpleDetailRow()],
    validation: null,
    importFile: null,
    statusMessage: SIMPLE_INPUT_DEFAULT_MESSAGE,
    statusTone: 'info',
    printConfig: null,
    results: null,
    committing: false,
};

function createDefaultTableRow() {
    return {
        id: tableRowSequence++,
        name: '',
        managementType: '個別管理',
        manufacturer: '',
        modelNumber: '',
        serialNumber: '',
        quantity: '',
        storageLocation: '',
        genre: '',
        purchaseDate: '',
        note: ''
    };
}

const tableBatchState = {
    rows: [createDefaultTableRow()],
    validation: null,
    importFile: null,
    statusMessage: TABLE_INPUT_DEFAULT_MESSAGE,
    statusTone: 'info',
    printConfig: null,
    results: null,
    committing: false,
};

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
}

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

function clearBatchPreviewState() {
    batchImportState.sourceFileName = '';
    batchImportState.rows = [];
    batchImportState.validation = null;
    batchImportState.importFile = null;
}

function setBatchStatus(message, tone = 'info') {
    batchImportState.statusMessage = message;
    batchImportState.statusTone = tone;
}

function clearBatchImportState() {
    clearBatchPreviewState();
    setBatchStatus(BATCH_PREVIEW_DEFAULT_MESSAGE, 'info');
    batchImportState.printConfig = null;
    batchImportState.results = null;
    batchImportState.committing = false;

    sessionStorage.removeItem('last_import_print_config');
    sessionStorage.removeItem('last_import_results');
}

function clearSimplePreviewState() {
    simpleBatchState.validation = null;
    simpleBatchState.importFile = null;
}

function setSimpleBatchStatus(message, tone = 'info') {
    simpleBatchState.statusMessage = message;
    simpleBatchState.statusTone = tone;
}

function resetSimpleSerialGeneratorInputs() {
    const prefixEl = document.getElementById('simple-serial-prefix');
    const startEl = document.getElementById('simple-serial-start');

    if (prefixEl) {
        prefixEl.value = '';
    }
    if (startEl) {
        startEl.value = '001';
    }
}

function clearSimpleBatchState() {
    simpleDetailRowSequence = 1;
    simpleBatchState.common = createDefaultSimpleCommonFields();
    simpleBatchState.rows = [createSimpleDetailRow()];
    clearSimplePreviewState();
    setSimpleBatchStatus(SIMPLE_INPUT_DEFAULT_MESSAGE, 'info');
    simpleBatchState.printConfig = null;
    simpleBatchState.results = null;
    simpleBatchState.committing = false;
    resetSimpleSerialGeneratorInputs();
}

function markSimpleBatchDirty(message = '入力内容が変更されました。プレビューを更新してください。') {
    clearSimplePreviewState();
    setSimpleBatchStatus(message, 'warning');
}

function clearTableBatchPreviewState() {
    tableBatchState.validation = null;
    tableBatchState.importFile = null;
}

function setTableBatchStatus(message, tone = 'info') {
    tableBatchState.statusMessage = message;
    tableBatchState.statusTone = tone;
}

function clearTableBatchState() {
    tableRowSequence = 1;
    tableBatchState.rows = [createDefaultTableRow()];
    clearTableBatchPreviewState();
    setTableBatchStatus(TABLE_INPUT_DEFAULT_MESSAGE, 'info');
    tableBatchState.printConfig = null;
    tableBatchState.results = null;
    tableBatchState.committing = false;
}

function markTableBatchDirty(message = '入力内容が変更されました。プレビューを更新してください。') {
    clearTableBatchPreviewState();
    setTableBatchStatus(message, 'warning');
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
    return Boolean(manualArea) && !manualArea.hidden;
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

    manualArea.hidden = !isOpen;
    if (isOpen) {
        manualArea.classList.remove('fade-in');
        void manualArea.offsetWidth;
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

function pickFirstBatchResultText(values) {
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    return '';
}

function getBatchResultSourceLabel(result, index) {
    const candidates = [
        result?.source_line,
        result?.sourceLine,
        result?.line_number,
        result?.lineNumber,
        result?.row_number,
        result?.rowNumber,
        result?.row
    ];

    for (let i = 0; i < candidates.length; i += 1) {
        const num = Number(candidates[i]);
        if (Number.isInteger(num) && num > 0) {
            return `${num}行目`;
        }
    }

    return `${index + 1}件目`;
}

function buildBatchCommitFailureMessage(result, index) {
    const sourceLabel = getBatchResultSourceLabel(result, index);
    const name = cleanCell(result?.name);
    const message = pickFirstBatchResultText([
        result?.error_message,
        result?.message,
        result?.error?.message,
        result?.error,
        result?.detail,
        result?.reason
    ]) || '登録に失敗しました。';
    const targetLabel = name === '' ? sourceLabel : `${sourceLabel} (${name})`;

    return `${targetLabel}: ${message}`;
}

function summarizeBatchCommitResults(results) {
    const safeResults = Array.isArray(results) ? results : [];
    const summary = {
        totalCount: safeResults.length,
        successCount: 0,
        failureCount: 0,
        failureMessages: []
    };

    for (let i = 0; i < safeResults.length; i += 1) {
        const result = safeResults[i];
        if (result?.ok === true) {
            summary.successCount += 1;
            continue;
        }

        summary.failureCount += 1;
        if (summary.failureMessages.length < 10) {
            summary.failureMessages.push(buildBatchCommitFailureMessage(result, i));
        }
    }

    return summary;
}

function notifyBatchCommitFailures(summary) {
    if (!summary || summary.failureCount === 0) {
        return;
    }

    const headline = summary.successCount > 0
        ? `一括登録は一部失敗しました。\n成功: ${summary.successCount}件 / 失敗: ${summary.failureCount}件`
        : `一括登録に成功した行はありませんでした。\n失敗: ${summary.failureCount}件`;
    const detailText = summary.failureMessages.length > 0
        ? `\n\n失敗詳細:\n${summary.failureMessages.join('\n')}`
        : '';
    const remainingCount = Math.max(0, summary.failureCount - summary.failureMessages.length);
    const tail = remainingCount > 0 ? `\n...他 ${remainingCount}件` : '';

    alert(headline + detailText + tail);
}

function buildBatchCommitCompletionMessage(summary) {
    if (!summary || summary.totalCount === 0) {
        return '一括登録が完了しました';
    }

    if (summary.failureCount === 0) {
        return `一括登録が完了しました（${summary.successCount}件成功）`;
    }

    if (summary.successCount > 0) {
        return `一括登録は一部失敗しました（成功${summary.successCount}件 / 失敗${summary.failureCount}件）`;
    }

    return `一括登録は失敗しました（失敗${summary.failureCount}件）`;
}

function showBatchCommitCompletion(summary) {
    const message = buildBatchCommitCompletionMessage(summary);

    if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
        CommonController.showComplete(message);
    } else {
        Router.to('complete');
    }
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

    return String(value).replace(/^\uFEFF/, '').trim();
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
        dataRows.push({
            cells: rows[i],
            lineNumber: i + 1,
        });
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

function parsePurchaseDateValue(value) {
    const v = normalizeFullWidthDigits(cleanCell(value));
    if (v === '') {
        return { empty: true, value: null, error: null };
    }

    const m = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!m) {
        return {
            empty: false,
            value: null,
            error: '購入日の形式が不正です。yyyy/mm/dd または yyyy-mm-dd で入力してください。'
        };
    }

    const year = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');

    return {
        empty: false,
        value: year + '-' + month + '-' + day + 'T00:00:00+09:00',
        error: null
    };
}

function normalizeBatchManagementType(value) {
    const v = cleanCell(value);
    if (v === '個別管理') {
        return { key: 'individual', id: '1', label: '個別管理' };
    }
    if (v === '一括管理') {
        return { key: 'bulk', id: '2', label: '一括管理' };
    }

    return null;
}

function resolveGenreIdByName(name) {
    const genreName = cleanCell(name);
    const genre = genreByName(genreName);

    if (!genre) {
        return null;
    }

    return String(genre.id);
}

function parsePositiveInteger(value) {
    const raw = normalizeFullWidthDigits(cleanCell(value));
    if (raw === '') {
        return null;
    }

    const num = Number(raw);
    if (!Number.isInteger(num) || num < 1) {
        return null;
    }

    return num;
}

function createBatchIssue(level, field, message) {
    return { level, field, message };
}

function buildBatchIssueMap(issues) {
    const issueMap = {};

    for (let i = 0; i < issues.length; i += 1) {
        const issue = issues[i];
        if (!issueMap[issue.field]) {
            issueMap[issue.field] = { level: issue.level, messages: [] };
        }

        issueMap[issue.field].messages.push(issue.message);
        if (issue.level === 'error') {
            issueMap[issue.field].level = 'error';
        }
    }

    return issueMap;
}

function buildBatchRowFromTemplateData(dataRow, indexMap) {
    const cells = dataRow.cells;

    return {
        sourceLine: dataRow.lineNumber,
        name: getCellByHeader(cells, indexMap, '備品名'),
        managementType: getCellByHeader(cells, indexMap, '管理区分'),
        manufacturer: getCellByHeader(cells, indexMap, 'メーカー'),
        modelNumber: getCellByHeader(cells, indexMap, '型番'),
        serialNumber: getCellByHeader(cells, indexMap, 'シリアル番号'),
        quantity: getCellByHeader(cells, indexMap, '個数'),
        storageLocation: getCellByHeader(cells, indexMap, '保管場所（所有者）'),
        genre: getCellByHeader(cells, indexMap, '備品ジャンル'),
        purchaseDate: getCellByHeader(cells, indexMap, '購入日(yyyy/mm/dd)'),
        note: getCellByHeader(cells, indexMap, '備考')
    };
}

function isEmptyBatchRow(row) {
    return BATCH_TEMPLATE_FIELDS.every(field => cleanCell(row[field.key]) === '');
}

function validateBatchRow(row) {
    const errors = [];
    const warnings = [];
    const normalized = {
        managementTypeKey: null,
        managementCategoryId: '',
        genreId: '',
        quantity: '1',
        purchasedAt: '',
        serialKey: ''
    };

    if (cleanCell(row.name) === '') {
        errors.push(createBatchIssue('error', 'name', '備品名は必須です。'));
    }

    const managementType = normalizeBatchManagementType(row.managementType);
    if (!managementType) {
        errors.push(createBatchIssue('error', 'managementType', '管理区分は「個別管理」または「一括管理」で入力してください。'));
    } else {
        normalized.managementTypeKey = managementType.key;
        normalized.managementCategoryId = managementType.id;
    }

    if (cleanCell(row.quantity) === '') {
        warnings.push(createBatchIssue('warning', 'quantity', '個数が未入力のため 1 として扱います。'));
    } else {
        const quantity = parsePositiveInteger(row.quantity);
        if (quantity == null) {
            errors.push(createBatchIssue('error', 'quantity', '個数には 1 以上の整数を入力してください。'));
        } else {
            normalized.quantity = String(quantity);
        }
    }

    if (normalized.managementTypeKey === 'individual' && normalized.quantity !== '1') {
        errors.push(createBatchIssue('error', 'quantity', '個別管理の個数は 1 で入力してください。'));
    }

    if (normalized.managementTypeKey === 'individual' && cleanCell(row.serialNumber) === '') {
        warnings.push(createBatchIssue('warning', 'serialNumber', '個別管理ではシリアル番号の入力を推奨します。'));
    }

    if (normalized.managementTypeKey === 'bulk' && cleanCell(row.serialNumber) !== '') {
        warnings.push(createBatchIssue('warning', 'serialNumber', '一括管理ではシリアル番号は通常不要です。'));
    }

    if (cleanCell(row.genre) === '') {
        errors.push(createBatchIssue('error', 'genre', '備品ジャンルは必須です。'));
    } else {
        const genreId = resolveGenreIdByName(row.genre);
        if (!genreId) {
            errors.push(createBatchIssue('error', 'genre', '備品ジャンルが不正です。'));
        } else {
            normalized.genreId = genreId;
        }
    }

    const parsedPurchaseDate = parsePurchaseDateValue(row.purchaseDate);
    if (parsedPurchaseDate.empty) {
        warnings.push(createBatchIssue('warning', 'purchaseDate', '購入日が未入力のため登録日当日を設定します。'));
        normalized.purchasedAt = toLocalDateTimeIso(new Date());
    } else if (parsedPurchaseDate.error) {
        errors.push(createBatchIssue('error', 'purchaseDate', parsedPurchaseDate.error));
    } else {
        normalized.purchasedAt = parsedPurchaseDate.value;
    }

    normalized.serialKey = cleanCell(row.serialNumber).toUpperCase();

    return {
        row,
        normalized,
        errors,
        warnings,
        issueMap: buildBatchIssueMap(errors.concat(warnings))
    };
}

function applyDuplicateSerialValidation(rowResults) {
    const duplicates = new Map();

    for (let i = 0; i < rowResults.length; i += 1) {
        const rowResult = rowResults[i];
        if (rowResult.normalized.managementTypeKey !== 'individual') {
            continue;
        }

        if (!rowResult.normalized.serialKey) {
            continue;
        }

        if (!duplicates.has(rowResult.normalized.serialKey)) {
            duplicates.set(rowResult.normalized.serialKey, []);
        }

        duplicates.get(rowResult.normalized.serialKey).push(rowResult);
    }

    duplicates.forEach(items => {
        if (items.length < 2) {
            return;
        }

        for (let i = 0; i < items.length; i += 1) {
            items[i].errors.push(createBatchIssue('error', 'serialNumber', '個別管理のシリアル番号が重複しています。'));
            items[i].issueMap = buildBatchIssueMap(items[i].errors.concat(items[i].warnings));
        }
    });
}

function validateBatchRows(rows) {
    const rowResults = rows.map(validateBatchRow);
    applyDuplicateSerialValidation(rowResults);

    const summary = {
        totalRows: rowResults.length,
        validRowCount: 0,
        errorRowCount: 0,
        warningRowCount: 0,
        individualCount: 0,
        bulkCount: 0,
        genreCounts: {}
    };

    for (let i = 0; i < rowResults.length; i += 1) {
        const rowResult = rowResults[i];

        if (rowResult.errors.length > 0) {
            summary.errorRowCount += 1;
        } else {
            summary.validRowCount += 1;

            if (rowResult.normalized.managementTypeKey === 'individual') {
                summary.individualCount += 1;
            }
            if (rowResult.normalized.managementTypeKey === 'bulk') {
                summary.bulkCount += 1;
            }

            const genreName = cleanCell(rowResult.row.genre);
            if (genreName !== '') {
                summary.genreCounts[genreName] = (summary.genreCounts[genreName] || 0) + 1;
            }
        }

        if (rowResult.warnings.length > 0) {
            summary.warningRowCount += 1;
        }
    }

    return {
        rowResults,
        summary,
        hasErrors: summary.errorRowCount > 0,
        hasWarnings: summary.warningRowCount > 0
    };
}

function formatBatchPreviewPurchaseDate(value) {
    const raw = cleanCell(value);
    if (raw === '') {
        return '';
    }

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        return raw;
    }

    return `${match[1]}/${match[2]}/${match[3]}`;
}

function getBatchPreviewValue(rowResult, fieldKey) {
    if (fieldKey === 'quantity') {
        return rowResult.issueMap.quantity?.level === 'error'
            ? rowResult.row.quantity
            : rowResult.normalized.quantity;
    }

    if (fieldKey === 'purchaseDate') {
        return rowResult.issueMap.purchaseDate?.level === 'error'
            ? rowResult.row.purchaseDate
            : formatBatchPreviewPurchaseDate(rowResult.normalized.purchasedAt);
    }

    return rowResult.row[fieldKey];
}

function buildImportCsvFromValidatedRows(rowResults) {
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

    for (let i = 0; i < rowResults.length; i += 1) {
        const rowResult = rowResults[i];
        if (rowResult.errors.length > 0) {
            continue;
        }

        const row = rowResult.row;
        const normalized = rowResult.normalized;

        outputRows.push([
            row.name,
            normalized.managementCategoryId,
            normalized.genreId,
            row.manufacturer,
            row.modelNumber,
            row.serialNumber,
            normalized.quantity,
            normalized.purchasedAt,
            '1',
            row.storageLocation,
            row.storageLocation,
            '',
            '',
            '',
            row.note
        ]);
    }

    if (outputRows.length === 1) {
        return null;
    }

    const csvText = stringifyCsv(outputRows);

    return new File([csvText], 'assets_import.csv', { type: 'text/csv;charset=utf-8' });
}

async function buildBatchImportPreviewFromTemplateFile(file) {
    await AppState.ensureMasterData();

    const text = await file.text();
    const parsed = parseTemplateRows(text);
    const headerRow = parsed.headerRow;
    const dataRows = parsed.dataRows;
    const indexMap = findHeaderIndexMap(headerRow);

    const rows = [];

    for (let i = 0; i < dataRows.length; i += 1) {
        const row = buildBatchRowFromTemplateData(dataRows[i], indexMap);
        if (isEmptyBatchRow(row)) {
            continue;
        }
        rows.push(row);
    }

    if (rows.length === 0) {
        throw new Error('登録対象のデータ行がありません');
    }

    const validation = validateBatchRows(rows);
    const importFile = buildImportCsvFromValidatedRows(validation.rowResults);

    return {
        rows,
        validation,
        importFile
    };
}

function isSimpleIndividualMode() {
    return simpleBatchState.common.managementType !== 'bulk';
}

function getSimpleManagementTypeLabel() {
    return isSimpleIndividualMode() ? '個別管理' : '一括管理';
}

function isEmptySimpleDetailRow(row) {
    if (isSimpleIndividualMode()) {
        return cleanCell(row.name) === ''
            && cleanCell(row.serialNumber) === ''
            && cleanCell(row.note) === '';
    }

    return cleanCell(row.name) === ''
        && cleanCell(row.quantity) === ''
        && cleanCell(row.note) === '';
}

function buildRowsFromSimpleBatchState() {
    const rows = [];
    const managementType = getSimpleManagementTypeLabel();

    for (let i = 0; i < simpleBatchState.rows.length; i += 1) {
        const detail = simpleBatchState.rows[i];
        if (isEmptySimpleDetailRow(detail)) {
            continue;
        }

        rows.push({
            sourceLine: i + 1,
            name: cleanCell(detail.name),
            managementType,
            manufacturer: cleanCell(simpleBatchState.common.manufacturer),
            modelNumber: cleanCell(simpleBatchState.common.modelNumber),
            serialNumber: isSimpleIndividualMode() ? cleanCell(detail.serialNumber) : '',
            quantity: isSimpleIndividualMode() ? '1' : cleanCell(detail.quantity),
            storageLocation: cleanCell(simpleBatchState.common.storageLocation),
            genre: cleanCell(simpleBatchState.common.genre),
            purchaseDate: cleanCell(simpleBatchState.common.purchaseDate),
            note: cleanCell(detail.note)
        });
    }

    return rows;
}

function isEmptyTableBatchRow(row) {
    const keys = [
        'name',
        'manufacturer',
        'modelNumber',
        'serialNumber',
        'quantity',
        'storageLocation',
        'genre',
        'purchaseDate',
        'note'
    ];

    return keys.every(key => cleanCell(row[key]) === '');
}

function buildRowsFromTableBatchState() {
    const rows = [];

    for (let i = 0; i < tableBatchState.rows.length; i += 1) {
        const row = tableBatchState.rows[i];
        if (isEmptyTableBatchRow(row)) {
            continue;
        }

        rows.push({
            sourceLine: i + 1,
            name: cleanCell(row.name),
            managementType: cleanCell(row.managementType),
            manufacturer: cleanCell(row.manufacturer),
            modelNumber: cleanCell(row.modelNumber),
            serialNumber: cleanCell(row.serialNumber),
            quantity: cleanCell(row.quantity),
            storageLocation: cleanCell(row.storageLocation),
            genre: cleanCell(row.genre),
            purchaseDate: cleanCell(row.purchaseDate),
            note: cleanCell(row.note)
        });
    }

    return rows;
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

function readBatchLabelSettings() {
    const labelType = document.getElementById('labelCodeType')?.value || 'QR';
    const tapeWidth = document.getElementById('labelTapeWidth')?.value || '9';
    const halfcut = document.getElementById('labelHalfcut')?.checked !== false;

    return {
        type: labelType,
        width: tapeWidth,
        halfcut
    };
}

function buildBatchStatusBadge(rowResult) {
    if (rowResult.errors.length > 0) {
        return '<span class="status-badge badge-error">エラー</span>';
    }
    if (rowResult.warnings.length > 0) {
        return '<span class="status-badge badge-warn">要確認</span>';
    }
    return '<span class="status-badge badge-normal">OK</span>';
}

function renderBatchIssueGroups(items, title, tone) {
    if (!items || items.length === 0) {
        return '';
    }

    return `
        <div class="batch-issue-group ${tone}">
            <div class="batch-issue-title">${escapeHtml(title)}</div>
            <ul class="batch-message-list">
                ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>
    `;
}

function renderBatchCell(value, issue) {
    const classes = [];
    if (issue?.level === 'error') {
        classes.push('batch-cell-error');
    } else if (issue?.level === 'warning') {
        classes.push('batch-cell-warning');
    }

    const title = issue ? ` title="${escapeHtml(issue.messages.join('\n'))}"` : '';
    const className = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
    const displayValue = cleanCell(value) === ''
        ? '<span class="batch-empty-value">-</span>'
        : escapeHtml(value);

    return `<td${className}${title}>${displayValue}</td>`;
}

function renderBatchIssueSummary(rowResult) {
    const messages = rowResult.errors.concat(rowResult.warnings)
        .map(issue => escapeHtml(issue.message));

    if (messages.length === 0) {
        return '<span class="batch-empty-value">-</span>';
    }

    return messages.join('<br>');
}

function renderValidationSummary(validation, sourceLabel) {
    const summary = validation.summary;
    const genreSummary = Object.keys(summary.genreCounts)
        .sort()
        .map(name => `${name}: ${summary.genreCounts[name]}件`)
        .join(' / ');

    return `
        <div class="batch-preview-meta">入力元: ${escapeHtml(sourceLabel || '-')}</div>
        <div class="batch-summary-grid">
            <div class="batch-summary-card"><span>読込行数</span><strong>${summary.totalRows}</strong></div>
            <div class="batch-summary-card"><span>登録可能</span><strong>${summary.validRowCount}</strong></div>
            <div class="batch-summary-card"><span>エラー行</span><strong>${summary.errorRowCount}</strong></div>
            <div class="batch-summary-card"><span>警告行</span><strong>${summary.warningRowCount}</strong></div>
            <div class="batch-summary-card"><span>個別管理</span><strong>${summary.individualCount}</strong></div>
            <div class="batch-summary-card"><span>一括管理</span><strong>${summary.bulkCount}</strong></div>
        </div>
        <div class="batch-preview-meta">ジャンル別: ${escapeHtml(genreSummary || 'なし')}</div>
    `;
}

function renderValidationIssues(validation) {
    const errors = [];
    const warnings = [];

    for (let i = 0; i < validation.rowResults.length; i += 1) {
        const rowResult = validation.rowResults[i];

        for (let j = 0; j < rowResult.errors.length; j += 1) {
            errors.push(`${rowResult.row.sourceLine}行目: ${rowResult.errors[j].message}`);
        }
        for (let j = 0; j < rowResult.warnings.length; j += 1) {
            warnings.push(`${rowResult.row.sourceLine}行目: ${rowResult.warnings[j].message}`);
        }
    }

    return [
        renderBatchIssueGroups(errors, 'エラー', 'error'),
        renderBatchIssueGroups(warnings, '警告', 'warning')
    ].join('');
}

function renderValidationTable(validation) {
    const head = BATCH_TEMPLATE_FIELDS
        .map(field => `<th>${escapeHtml(field.label)}</th>`)
        .join('');

    const body = validation.rowResults.map(rowResult => {
        const cells = BATCH_TEMPLATE_FIELDS.map(field => {
            return renderBatchCell(getBatchPreviewValue(rowResult, field.key), rowResult.issueMap[field.key]);
        }).join('');

        return `
            <tr>
                <td>${rowResult.row.sourceLine}</td>
                <td>${buildBatchStatusBadge(rowResult)}</td>
                ${cells}
                <td>${renderBatchIssueSummary(rowResult)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="batch-table-scroll">
            <table class="data-table batch-preview-table">
                <thead>
                    <tr>
                        <th>行</th>
                        <th>状態</th>
                        ${head}
                        <th>確認事項</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderBatchImportView() {
    const statusEl = document.getElementById('batch-preview-status');
    const summaryEl = document.getElementById('batch-preview-summary');
    const issuesEl = document.getElementById('batch-preview-issues');
    const tableEl = document.getElementById('batch-preview-table');
    const previewBtn = document.getElementById('batch-preview-btn');
    const resetBtn = document.getElementById('batch-reset-btn');
    const commitBtn = document.getElementById('batch-commit-btn');
    const fileInput = document.getElementById('file-csv');
    const validation = batchImportState.validation;
    const hasFile = Boolean(fileInput && fileInput.files && fileInput.files.length > 0);

    if (statusEl) {
        statusEl.innerHTML = `<div class="batch-status-banner ${escapeHtml(batchImportState.statusTone)}">${escapeHtml(batchImportState.statusMessage)}</div>`;
    }

    if (previewBtn) {
        previewBtn.disabled = batchImportState.committing;
        previewBtn.textContent = validation ? 'プレビューを更新' : 'プレビューを作成';
    }

    if (resetBtn) {
        resetBtn.disabled = batchImportState.committing || (!hasFile && !validation);
    }

    if (commitBtn) {
        const canCommit = Boolean(validation) && !validation.hasErrors && Boolean(batchImportState.importFile) && !batchImportState.committing;
        commitBtn.disabled = !canCommit;
        commitBtn.textContent = batchImportState.committing ? '登録中...' : '登録を確定';
    }

    if (!validation) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (issuesEl) issuesEl.innerHTML = '';
        if (tableEl) tableEl.innerHTML = '';
        return;
    }

    if (summaryEl) {
        summaryEl.innerHTML = renderValidationSummary(validation, batchImportState.sourceFileName || 'CSVファイル');
    }
    if (issuesEl) {
        issuesEl.innerHTML = renderValidationIssues(validation);
    }
    if (tableEl) {
        tableEl.innerHTML = renderValidationTable(validation);
    }
}

async function initBatchRegistration() {
    clearBatchImportState();
    await AppState.ensureMasterData();

    const fileInput = document.getElementById('file-csv');
    if (fileInput && fileInput.dataset.batchPreviewBound !== '1') {
        fileInput.dataset.batchPreviewBound = '1';
        fileInput.addEventListener('change', function () {
            clearBatchPreviewState();

            if (fileInput.files && fileInput.files.length > 0) {
                setBatchStatus('ファイルが変更されました。「プレビューを作成」を押して内容を確認してください。', 'warning');
            } else {
                setBatchStatus(BATCH_PREVIEW_DEFAULT_MESSAGE, 'info');
            }

            renderBatchImportView();
        });
    }

    renderBatchImportView();
}

function buildGenreSelectOptionsHtml(selectedValue) {
    const options = ['<option value="">選択してください</option>'];

    for (let i = 0; i < AppState.genres.length; i += 1) {
        const genre = AppState.genres[i];
        if (genre.is_disabled) {
            continue;
        }

        const selected = selectedValue === genre.name ? ' selected' : '';
        options.push(`<option value="${escapeHtml(genre.name)}"${selected}>${escapeHtml(genre.name)}</option>`);
    }

    return options.join('');
}

function renderSimpleDetailRows() {
    const isIndividual = isSimpleIndividualMode();
    const detailHeader = isIndividual ? 'シリアル番号' : '個数';

    const body = simpleBatchState.rows.map((row, index) => {
        const detailField = isIndividual
            ? `
                <td>
                    <input
                        type="text"
                        value="${escapeHtml(row.serialNumber)}"
                        oninput="RegController.updateSimpleRowField(${row.id}, 'serialNumber', this.value)"
                    />
                </td>
            `
            : `
                <td>
                    <input
                        type="number"
                        min="1"
                        value="${escapeHtml(row.quantity)}"
                        oninput="RegController.updateSimpleRowField(${row.id}, 'quantity', this.value)"
                    />
                </td>
            `;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <input
                        type="text"
                        value="${escapeHtml(row.name)}"
                        oninput="RegController.updateSimpleRowField(${row.id}, 'name', this.value)"
                    />
                </td>
                ${detailField}
                <td>
                    <input
                        type="text"
                        value="${escapeHtml(row.note)}"
                        oninput="RegController.updateSimpleRowField(${row.id}, 'note', this.value)"
                    />
                </td>
                <td class="batch-row-actions">
                    <button type="button" class="secondary-btn small-btn" onclick="RegController.duplicateSimpleRow(${row.id})">複製</button>
                    <button type="button" class="secondary-btn small-btn" onclick="RegController.removeSimpleRow(${row.id})">削除</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="batch-table-scroll">
            <table class="data-table simple-input-table">
                <thead>
                    <tr>
                        <th>行</th>
                        <th>備品名</th>
                        <th>${detailHeader}</th>
                        <th>備考</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderSimpleBatchPreviewView() {
    const statusEl = document.getElementById('simple-preview-status');
    const summaryEl = document.getElementById('simple-preview-summary');
    const issuesEl = document.getElementById('simple-preview-issues');
    const previewTableEl = document.getElementById('simple-preview-table');
    const previewBtn = document.getElementById('simple-preview-btn');
    const resetBtn = document.getElementById('simple-reset-btn');
    const commitBtn = document.getElementById('simple-commit-btn');
    const validation = simpleBatchState.validation;

    if (statusEl) {
        statusEl.innerHTML = `<div class="batch-status-banner ${escapeHtml(simpleBatchState.statusTone)}">${escapeHtml(simpleBatchState.statusMessage)}</div>`;
    }
    if (previewBtn) {
        previewBtn.disabled = simpleBatchState.committing;
        previewBtn.textContent = validation ? 'プレビューを更新' : 'プレビューを作成';
    }
    if (resetBtn) {
        resetBtn.disabled = simpleBatchState.committing;
    }
    if (commitBtn) {
        const canCommit = Boolean(validation) && !validation.hasErrors && Boolean(simpleBatchState.importFile) && !simpleBatchState.committing;
        commitBtn.disabled = !canCommit;
        commitBtn.textContent = simpleBatchState.committing ? '登録中...' : '登録を確定';
    }

    if (!validation) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (issuesEl) issuesEl.innerHTML = '';
        if (previewTableEl) previewTableEl.innerHTML = '';
        return;
    }

    if (summaryEl) {
        summaryEl.innerHTML = renderValidationSummary(validation, 'かんたん入力');
    }
    if (issuesEl) {
        issuesEl.innerHTML = renderValidationIssues(validation);
    }
    if (previewTableEl) {
        previewTableEl.innerHTML = renderValidationTable(validation);
    }
}

function renderSimpleBatchView() {
    const managementTypeEl = document.getElementById('simple-management-type');
    const manufacturerEl = document.getElementById('simple-manufacturer');
    const modelNumberEl = document.getElementById('simple-model-number');
    const storageLocationEl = document.getElementById('simple-storage-location');
    const genreEl = document.getElementById('simple-genre');
    const purchaseDateEl = document.getElementById('simple-purchase-date');
    const serialToolsEl = document.getElementById('simple-serial-tools');
    const detailTableEl = document.getElementById('simple-detail-table');

    if (managementTypeEl) {
        managementTypeEl.value = simpleBatchState.common.managementType;
    }
    if (manufacturerEl) {
        manufacturerEl.value = simpleBatchState.common.manufacturer;
    }
    if (modelNumberEl) {
        modelNumberEl.value = simpleBatchState.common.modelNumber;
    }
    if (storageLocationEl) {
        storageLocationEl.value = simpleBatchState.common.storageLocation;
    }
    if (genreEl) {
        genreEl.innerHTML = buildGenreSelectOptionsHtml(simpleBatchState.common.genre);
    }
    if (purchaseDateEl) {
        purchaseDateEl.value = simpleBatchState.common.purchaseDate;
    }
    if (serialToolsEl) {
        serialToolsEl.hidden = !isSimpleIndividualMode();
    }
    if (detailTableEl) {
        detailTableEl.innerHTML = renderSimpleDetailRows();
    }

    renderSimpleBatchPreviewView();
}

async function initSimpleBatchRegistration() {
    clearSimpleBatchState();
    await AppState.ensureMasterData();
    renderSimpleBatchView();
}

function renderTableBatchRows() {
    const genreOptionsHtml = buildGenreSelectOptionsHtml('');

    const body = tableBatchState.rows.map((row, index) => {
        const selectedIndividual = row.managementType === '個別管理' ? ' selected' : '';
        const selectedBulk = row.managementType === '一括管理' ? ' selected' : '';
        const genreOptions = genreOptionsHtml.replace(
            `value="${escapeHtml(row.genre)}"`,
            `value="${escapeHtml(row.genre)}" selected`
        );

        return `
            <tr>
                <td>${index + 1}</td>
                <td><input type="text" value="${escapeHtml(row.name)}" oninput="RegController.updateTableBatchField(${row.id}, 'name', this.value)" /></td>
                <td>
                    <select onchange="RegController.updateTableBatchField(${row.id}, 'managementType', this.value)">
                        <option value="個別管理"${selectedIndividual}>個別管理</option>
                        <option value="一括管理"${selectedBulk}>一括管理</option>
                    </select>
                </td>
                <td><input type="text" value="${escapeHtml(row.manufacturer)}" oninput="RegController.updateTableBatchField(${row.id}, 'manufacturer', this.value)" /></td>
                <td><input type="text" value="${escapeHtml(row.modelNumber)}" oninput="RegController.updateTableBatchField(${row.id}, 'modelNumber', this.value)" /></td>
                <td><input type="text" value="${escapeHtml(row.serialNumber)}" oninput="RegController.updateTableBatchField(${row.id}, 'serialNumber', this.value)" /></td>
                <td><input type="number" min="1" value="${escapeHtml(row.quantity)}" oninput="RegController.updateTableBatchField(${row.id}, 'quantity', this.value)" /></td>
                <td><input type="text" value="${escapeHtml(row.storageLocation)}" oninput="RegController.updateTableBatchField(${row.id}, 'storageLocation', this.value)" /></td>
                <td>
                    <select onchange="RegController.updateTableBatchField(${row.id}, 'genre', this.value)">
                        ${genreOptions}
                    </select>
                </td>
                <td><input type="date" value="${escapeHtml(row.purchaseDate)}" onchange="RegController.updateTableBatchField(${row.id}, 'purchaseDate', this.value)" /></td>
                <td><input type="text" value="${escapeHtml(row.note)}" oninput="RegController.updateTableBatchField(${row.id}, 'note', this.value)" /></td>
                <td class="batch-row-actions">
                    <button type="button" class="secondary-btn small-btn" onclick="RegController.duplicateTableBatchRow(${row.id})">複製</button>
                    <button type="button" class="secondary-btn small-btn" onclick="RegController.removeTableBatchRow(${row.id})">削除</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="batch-table-scroll">
            <table class="data-table table-input-table">
                <thead>
                    <tr>
                        <th>行</th>
                        <th>備品名</th>
                        <th>管理区分</th>
                        <th>メーカー</th>
                        <th>型番</th>
                        <th>シリアル番号</th>
                        <th>個数</th>
                        <th>保管場所（所有者）</th>
                        <th>備品ジャンル</th>
                        <th>購入日</th>
                        <th>備考</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderTableBatchPreviewView() {
    const statusEl = document.getElementById('table-preview-status');
    const summaryEl = document.getElementById('table-preview-summary');
    const issuesEl = document.getElementById('table-preview-issues');
    const previewTableEl = document.getElementById('table-preview-table');
    const previewBtn = document.getElementById('table-preview-btn');
    const resetBtn = document.getElementById('table-reset-btn');
    const commitBtn = document.getElementById('table-commit-btn');
    const validation = tableBatchState.validation;

    if (statusEl) {
        statusEl.innerHTML = `<div class="batch-status-banner ${escapeHtml(tableBatchState.statusTone)}">${escapeHtml(tableBatchState.statusMessage)}</div>`;
    }

    if (previewBtn) {
        previewBtn.disabled = tableBatchState.committing;
        previewBtn.textContent = validation ? 'プレビューを更新' : 'プレビューを作成';
    }

    if (resetBtn) {
        resetBtn.disabled = tableBatchState.committing;
    }

    if (commitBtn) {
        const canCommit = Boolean(validation) && !validation.hasErrors && Boolean(tableBatchState.importFile) && !tableBatchState.committing;
        commitBtn.disabled = !canCommit;
        commitBtn.textContent = tableBatchState.committing ? '登録中...' : '登録を確定';
    }

    if (!validation) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (issuesEl) issuesEl.innerHTML = '';
        if (previewTableEl) previewTableEl.innerHTML = '';
        return;
    }

    if (summaryEl) {
        summaryEl.innerHTML = renderValidationSummary(validation, '表形式で入力');
    }
    if (issuesEl) {
        issuesEl.innerHTML = renderValidationIssues(validation);
    }
    if (previewTableEl) {
        previewTableEl.innerHTML = renderValidationTable(validation);
    }
}

function renderTableBatchView() {
    const inputTableEl = document.getElementById('table-input-table');
    if (inputTableEl) {
        inputTableEl.innerHTML = renderTableBatchRows();
    }

    renderTableBatchPreviewView();
}

async function initTableBatchRegistration() {
    clearTableBatchState();
    await AppState.ensureMasterData();
    renderTableBatchView();
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

    openBatchMode(mode) {
        if (mode === 'simple') {
            Router.to('reg-batch-simple');
            return;
        }

        if (mode === 'table') {
            Router.to('reg-batch-table');
            return;
        }

        if (mode === 'csv') {
            Router.to('reg-batch');
            return;
        }
    },

    updateSimpleCommonField(field, value) {
        simpleBatchState.common[field] = value;
        markSimpleBatchDirty();
        if (field === 'managementType' || field === 'genre') {
            renderSimpleBatchView();
            return;
        }

        renderSimpleBatchPreviewView();
    },

    updateSimpleRowField(rowId, field, value) {
        const row = simpleBatchState.rows.find(item => item.id === rowId);
        if (!row) {
            return;
        }

        row[field] = value;
        markSimpleBatchDirty();
        renderSimpleBatchPreviewView();
    },

    addSimpleRow() {
        simpleBatchState.rows.push(createSimpleDetailRow());
        markSimpleBatchDirty('明細行を追加しました。プレビューを更新してください。');
        renderSimpleBatchView();
    },

    duplicateSimpleRow(rowId) {
        const row = simpleBatchState.rows.find(item => item.id === rowId);
        if (!row) {
            return;
        }

        simpleBatchState.rows.push({
            ...row,
            id: simpleDetailRowSequence++,
        });
        markSimpleBatchDirty('明細行を複製しました。プレビューを更新してください。');
        renderSimpleBatchView();
    },

    removeSimpleRow(rowId) {
        if (simpleBatchState.rows.length === 1) {
            simpleBatchState.rows = [createSimpleDetailRow()];
        } else {
            simpleBatchState.rows = simpleBatchState.rows.filter(item => item.id !== rowId);
        }

        if (simpleBatchState.rows.length === 0) {
            simpleBatchState.rows.push(createSimpleDetailRow());
        }

        markSimpleBatchDirty('明細行を更新しました。プレビューを更新してください。');
        renderSimpleBatchView();
    },

    generateSimpleSerials() {
        if (!isSimpleIndividualMode()) {
            return;
        }

        const prefix = document.getElementById('simple-serial-prefix')?.value || '';
        const startRaw = (document.getElementById('simple-serial-start')?.value || '').trim();

        if (!/^\d+$/.test(startRaw)) {
            alert('開始番号には数字を入力してください');
            return;
        }

        const startNumber = Number(startRaw);
        const width = startRaw.length;

        for (let i = 0; i < simpleBatchState.rows.length; i += 1) {
            simpleBatchState.rows[i].serialNumber = prefix + String(startNumber + i).padStart(width, '0');
        }

        markSimpleBatchDirty('シリアル番号を連番生成しました。プレビューを更新してください。');
        renderSimpleBatchView();
    },

    async prepareSimpleBatchPreview() {
        let rows;
        try {
            rows = buildRowsFromSimpleBatchState();
            if (rows.length === 0) {
                throw new Error('明細行を1件以上入力してください');
            }
        } catch (error) {
            setSimpleBatchStatus('入力内容を確認してください。', 'error');
            renderSimpleBatchView();
            alert(error.message || '入力内容を確認してください');
            return;
        }

        const validation = validateBatchRows(rows);
        const importFile = buildImportCsvFromValidatedRows(validation.rowResults);

        simpleBatchState.validation = validation;
        simpleBatchState.importFile = importFile;

        if (validation.hasErrors) {
            setSimpleBatchStatus('エラーがあるため登録できません。入力内容を修正してください。', 'error');
        } else if (validation.hasWarnings) {
            setSimpleBatchStatus('登録可能です。警告を確認してから「登録を確定」を押してください。', 'warning');
        } else {
            setSimpleBatchStatus('登録可能です。内容を確認してから「登録を確定」を押してください。', 'success');
        }

        renderSimpleBatchView();
        document.getElementById('simple-preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    resetSimpleBatchInput() {
        clearSimpleBatchState();
        renderSimpleBatchView();
    },

    async commitSimpleBatchImport() {
        if (simpleBatchState.committing) {
            return;
        }

        if (!simpleBatchState.validation) {
            alert('先にプレビューを作成してください');
            return;
        }

        if (simpleBatchState.validation.hasErrors) {
            alert('エラーがあるため登録できません。入力内容を修正してから再度プレビューしてください。');
            return;
        }

        if (!simpleBatchState.importFile) {
            alert('登録対象データがありません');
            return;
        }

        simpleBatchState.committing = true;
        simpleBatchState.printConfig = readBatchLabelSettings();
        setSimpleBatchStatus('登録処理を実行しています。しばらくお待ちください。', 'info');
        renderSimpleBatchView();

        const formData = new FormData();
        formData.append('file', simpleBatchState.importFile);

        let response;
        try {
            response = await API.assets.batchRegister('commit', formData);
        } catch (error) {
            console.error(error);
            const msg =
                error.response?.data?.error?.message ||
                error.response?.data?.error ||
                error.message;

            simpleBatchState.committing = false;
            setSimpleBatchStatus('登録に失敗しました。内容を確認して再度実行してください。', 'error');
            renderSimpleBatchView();
            alert('一括登録に失敗しました: ' + msg);
            return;
        }

        simpleBatchState.results = Array.isArray(response?.results) ? response.results : [];
        const commitSummary = summarizeBatchCommitResults(simpleBatchState.results);
        notifyBatchCommitFailures(commitSummary);

        try {
            if (simpleBatchState.results.length === 0 || commitSummary.successCount > 0) {
                await this.printImportedLabels(simpleBatchState.printConfig, simpleBatchState.results);
            }
        } catch (error) {
            console.error('Post-commit print preparation error:', error);
            alert(
                '登録は完了しましたが、印刷準備でエラーが発生しました。\n'
                + (error.message || '一覧画面から手動で印刷してください。')
            );
        } finally {
            clearSimpleBatchState();
        }

        showBatchCommitCompletion(commitSummary);
    },

    updateTableBatchField(rowId, field, value) {
        const row = tableBatchState.rows.find(item => item.id === rowId);
        if (!row) {
            return;
        }

        row[field] = value;
        markTableBatchDirty();
        renderTableBatchPreviewView();
    },

    addTableBatchRow() {
        tableBatchState.rows.push(createDefaultTableRow());
        markTableBatchDirty('入力行を追加しました。プレビューを更新してください。');
        renderTableBatchView();
    },

    duplicateTableBatchRow(rowId) {
        const row = tableBatchState.rows.find(item => item.id === rowId);
        if (!row) {
            return;
        }

        tableBatchState.rows.push({
            ...row,
            id: tableRowSequence++,
        });
        markTableBatchDirty('入力行を複製しました。プレビューを更新してください。');
        renderTableBatchView();
    },

    removeTableBatchRow(rowId) {
        if (tableBatchState.rows.length === 1) {
            tableBatchState.rows = [createDefaultTableRow()];
        } else {
            tableBatchState.rows = tableBatchState.rows.filter(item => item.id !== rowId);
        }

        if (tableBatchState.rows.length === 0) {
            tableBatchState.rows.push(createDefaultTableRow());
        }

        markTableBatchDirty('入力行を更新しました。プレビューを更新してください。');
        renderTableBatchView();
    },

    async prepareTableBatchPreview() {
        let rows;
        try {
            rows = buildRowsFromTableBatchState();
            if (rows.length === 0) {
                throw new Error('入力行を1件以上入力してください');
            }
        } catch (error) {
            setTableBatchStatus('入力内容を確認してください。', 'error');
            renderTableBatchView();
            alert(error.message || '入力内容を確認してください');
            return;
        }

        const validation = validateBatchRows(rows);
        const importFile = buildImportCsvFromValidatedRows(validation.rowResults);

        tableBatchState.validation = validation;
        tableBatchState.importFile = importFile;

        if (validation.hasErrors) {
            setTableBatchStatus('エラーがあるため登録できません。入力内容を修正してください。', 'error');
        } else if (validation.hasWarnings) {
            setTableBatchStatus('登録可能です。警告を確認してから「登録を確定」を押してください。', 'warning');
        } else {
            setTableBatchStatus('登録可能です。内容を確認してから「登録を確定」を押してください。', 'success');
        }

        renderTableBatchView();
        document.getElementById('table-preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    resetTableBatchInput() {
        clearTableBatchState();
        renderTableBatchView();
    },

    async commitTableBatchImport() {
        if (tableBatchState.committing) {
            return;
        }

        if (!tableBatchState.validation) {
            alert('先にプレビューを作成してください');
            return;
        }

        if (tableBatchState.validation.hasErrors) {
            alert('エラーがあるため登録できません。入力内容を修正してから再度プレビューしてください。');
            return;
        }

        if (!tableBatchState.importFile) {
            alert('登録対象データがありません');
            return;
        }

        tableBatchState.committing = true;
        tableBatchState.printConfig = readBatchLabelSettings();
        setTableBatchStatus('登録処理を実行しています。しばらくお待ちください。', 'info');
        renderTableBatchView();

        const formData = new FormData();
        formData.append('file', tableBatchState.importFile);

        let response;
        try {
            response = await API.assets.batchRegister('commit', formData);
        } catch (error) {
            console.error(error);
            const msg =
                error.response?.data?.error?.message ||
                error.response?.data?.error ||
                error.message;

            tableBatchState.committing = false;
            setTableBatchStatus('登録に失敗しました。内容を確認して再度実行してください。', 'error');
            renderTableBatchView();
            alert('一括登録に失敗しました: ' + msg);
            return;
        }

        tableBatchState.results = Array.isArray(response?.results) ? response.results : [];
        const commitSummary = summarizeBatchCommitResults(tableBatchState.results);
        notifyBatchCommitFailures(commitSummary);

        try {
            if (tableBatchState.results.length === 0 || commitSummary.successCount > 0) {
                await this.printImportedLabels(tableBatchState.printConfig, tableBatchState.results);
            }
        } catch (error) {
            console.error('Post-commit print preparation error:', error);
            alert(
                '登録は完了しましたが、印刷準備でエラーが発生しました。\n'
                + (error.message || '一覧画面から手動で印刷してください。')
            );
        } finally {
            clearTableBatchState();
        }

        showBatchCommitCompletion(commitSummary);
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
                throw new Error(result?.error || '学生証の読み取りに失敗しました');
            }

            input.value = result.studentId;
            input.setCustomValidity('');
        } catch (err) {
            console.error('scan error:', err);
            input.value = '';
            input.setCustomValidity(err instanceof Error ? err.message : 'NFCの読み取りに失敗しました。');
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

    // 一括登録用 CSVプレビュー作成
    async prepareBatchPreview() {
        const fileInput = document.getElementById('file-csv');

        if (!fileInput || fileInput.files.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        const originalFile = fileInput.files[0];

        try {
            const preview = await buildBatchImportPreviewFromTemplateFile(originalFile);
            batchImportState.sourceFileName = originalFile.name;
            batchImportState.rows = preview.rows;
            batchImportState.validation = preview.validation;
            batchImportState.importFile = preview.importFile;

            if (preview.validation.hasErrors) {
                setBatchStatus('エラーがあるため登録できません。内容を確認して CSV を修正してください。', 'error');
            } else if (preview.validation.hasWarnings) {
                setBatchStatus('登録可能です。警告を確認してから「登録を確定」を押してください。', 'warning');
            } else {
                setBatchStatus('登録可能です。内容を確認してから「登録を確定」を押してください。', 'success');
            }

            renderBatchImportView();
            document.getElementById('batch-preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            console.error('CSV変換エラー:', error);
            clearBatchPreviewState();
            setBatchStatus('CSVの解析に失敗しました。テンプレート内容を確認してください。', 'error');
            renderBatchImportView();
            alert('CSVの変換に失敗しました: ' + (error.message || 'テンプレート内容を確認してください'));
        }
    },

    resetBatchPreview() {
        const fileInput = document.getElementById('file-csv');
        if (fileInput) {
            fileInput.value = '';
        }

        clearBatchImportState();
        renderBatchImportView();
    },

    // 一括登録の確定処理
    async commitBatchImport() {
        if (batchImportState.committing) {
            return;
        }

        if (!batchImportState.validation) {
            alert('先にプレビューを作成してください');
            return;
        }

        if (batchImportState.validation.hasErrors) {
            alert('エラーがあるため登録できません。CSV を修正してから再度プレビューしてください。');
            return;
        }

        if (!batchImportState.importFile) {
            alert('登録対象データがありません');
            return;
        }

        batchImportState.committing = true;
        batchImportState.printConfig = readBatchLabelSettings();
        setBatchStatus('登録処理を実行しています。しばらくお待ちください。', 'info');
        renderBatchImportView();

        const formData = new FormData();
        formData.append('file', batchImportState.importFile);

        let response;
        try {
            response = await API.assets.batchRegister('commit', formData);
        } catch (error) {
            console.error(error);
            const msg =
                error.response?.data?.error?.message ||
                error.response?.data?.error ||
                error.message;

            batchImportState.committing = false;
            setBatchStatus('登録に失敗しました。内容を確認して再度実行してください。', 'error');
            renderBatchImportView();
            alert('一括登録に失敗しました: ' + msg);
            return;
        }

        console.log('Batch upload response:', response);

        batchImportState.results = Array.isArray(response?.results) ? response.results : [];
        const commitSummary = summarizeBatchCommitResults(batchImportState.results);
        notifyBatchCommitFailures(commitSummary);

        try {
            if (batchImportState.results.length === 0 || commitSummary.successCount > 0) {
                await this.printImportedLabels(batchImportState.printConfig, batchImportState.results);
            }
        } catch (error) {
            console.error('Post-commit print preparation error:', error);
            alert(
                '登録は完了しましたが、印刷準備でエラーが発生しました。\n'
                + (error.message || '一覧画面から手動で印刷してください。')
            );
        } finally {
            clearBatchImportState();
        }

        showBatchCommitCompletion(commitSummary);
    },

    // 一括登録後のラベル印刷処理
    async printImportedLabels(config = batchImportState.printConfig, results = batchImportState.results) {
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
        if (serialGroup) serialGroup.hidden = true;
        if (serialInput) serialInput.required = false;

        // 数量: 表示 & 必須化
        if (quantityGroup) quantityGroup.hidden = false;
        if (quantityInput) quantityInput.required = true;

    } else {
        // === 個別管理モードの場合 ===
        // シリアル番号: 表示 & 必須化
        if (serialGroup) serialGroup.hidden = false;
        if (serialInput) serialInput.required = true;

        // 数量: 非表示 & 必須解除
        if (quantityGroup) quantityGroup.hidden = true;
        if (quantityInput) quantityInput.required = false;
    }
}

// =====================================
// Router から呼ばれる初期化フック
// =====================================
export async function initRegistration(step) {
    if (step === 'batch') {
        await initBatchRegistration();
    } else if (step === 'batch-simple') {
        await initSimpleBatchRegistration();
    } else if (step === 'batch-table') {
        await initTableBatchRegistration();
    } else if (step === 'step1') {
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

function getConfirmDisplayValue(value, fallback = '-') {
    const normalized = cleanCell(value);
    return normalized === '' ? fallback : normalized;
}

function createConfirmSection(title, rows) {
    const section = document.createElement('section');
    section.className = 'registration-confirm-card';

    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    section.appendChild(titleEl);

    for (let i = 0; i < rows.length; i += 1) {
        section.appendChild(createConfirmRow(rows[i][0], rows[i][1]));
    }

    return section;
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
    const basicRows = [
        ['管理方法', typeLabel],
        ['備品名', getConfirmDisplayValue(d.itemName)],
        ['メーカー', getConfirmDisplayValue(d.maker)],
        ['型番', getConfirmDisplayValue(d.model)],
        ['備品ジャンル', getConfirmDisplayValue(d.genre)]
    ];

    if (regState.type === 'individual') {
        basicRows.splice(4, 0, ['シリアル番号', getConfirmDisplayValue(d.serial)]);
    } else {
        basicRows.splice(4, 0, ['個数', getConfirmDisplayValue(d.quantity, '1')]);
    }

    const detailRows = [
        ['保管場所', getConfirmDisplayValue(d.location)],
        ['購入日', getConfirmDisplayValue(d.purchaseDate)],
        ['登録者', getConfirmDisplayValue(d.registrant)],
        ['備考', getConfirmDisplayValue(d.remarks)]
    ];
    const labelRows = [
        ['ラベル種別', codeTypeLabel],
        ['テープ幅', `${tapeWidth} mm`],
        ['ハーフカット', halfcutOn ? 'あり' : 'なし']
    ];

    display.replaceChildren(
        createConfirmSection('基本情報', basicRows),
        createConfirmSection('追加情報', detailRows),
        createConfirmSection('ラベル設定', labelRows)
    );
}
