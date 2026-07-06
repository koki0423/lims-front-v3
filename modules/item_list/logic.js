import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';
import { mountDeviceStatusPanel } from '../../js/device_status.js';
import { runWithButtonLoading, setControlsDisabled } from '../../js/ui_loading.js';
import { hidePageFeedback, showApiPageFeedback, showPageFeedback } from '../../js/ui_feedback.js';
import { loadViewState, saveViewState } from '../../js/view_state.js';

// === 状態管理 ===
const itemListState = {
    items: [],
    currentFilter: '',
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
    totalItems: 0,
    filterCache: {
        status: '',
        items: null
    },
    label: {
        codeType: 'QR',
        tapeWidth: 9,
        halfcut: true
    },
    loading: false,
    updating: false,
    labelPrinting: false,
};

const FILTER_FETCH_BATCH_SIZE = 200;
const ITEM_LIST_VIEW_STATE_KEY = 'item-list-view';

// ステータス定義（JSONのstatus_idに対応）
const STATUS_MAP = {
    1: { name: '正常', class: 'badge-normal' },
    2: { name: '故障', class: 'badge-error' },
    3: { name: '修理中', class: 'badge-warn' },
    4: { name: '貸出中', class: 'badge-warn' },
    5: { name: '廃棄済み', class: 'badge-gray' },
    6: { name: '紛失', class: 'badge-error' }
};

async function ensureGenresLoaded() {
    await AppState.loadGenres({ all: true });
}

function restoreItemListState() {
    const persisted = loadViewState(ITEM_LIST_VIEW_STATE_KEY, {});
    itemListState.currentFilter = persisted.currentFilter ?? '';
    itemListState.currentPage = Math.max(1, Number(persisted.currentPage) || 1);

    const itemsPerPage = Number(persisted.itemsPerPage);
    if ([10, 20, 50, 100].includes(itemsPerPage)) {
        itemListState.itemsPerPage = itemsPerPage;
    }
}

function persistItemListState() {
    saveViewState(ITEM_LIST_VIEW_STATE_KEY, {
        currentFilter: itemListState.currentFilter,
        currentPage: itemListState.currentPage,
        itemsPerPage: itemListState.itemsPerPage
    });
}

function syncItemListPerPageSelect() {
    const perPage = document.getElementById('item-list-per-page');
    if (perPage) {
        perPage.value = String(itemListState.itemsPerPage);
    }
}

function setItemListLoading(isLoading) {
    itemListState.loading = isLoading;
    setControlsDisabled([
        '#item-list-filter-controls .filter-btn',
        '#item-list-per-page',
        '#pagination-controls .page-btn',
        '#item-list-body .sm-btn'
    ], isLoading);
}

function getItemFilterFn() {
    if (itemListState.currentFilter === null || itemListState.currentFilter === '') {
        return null;
    }

    return (item) => String(item.status_id || 1) === String(itemListState.currentFilter);
}

function hasActiveItemFilter() {
    return itemListState.currentFilter !== null && itemListState.currentFilter !== '';
}

function resetItemFilterCache() {
    itemListState.filterCache.status = '';
    itemListState.filterCache.items = null;
}

function setReadonlyState(control, isReadonly) {
    if (!control) {
        return;
    }

    control.classList.toggle('readonly-input', isReadonly);
}

async function fetchAllFilteredItems() {
    if (
        Array.isArray(itemListState.filterCache.items)
        && String(itemListState.filterCache.status) === String(itemListState.currentFilter)
    ) {
        return itemListState.filterCache.items;
    }

    const allItems = [];
    let offset = 0;
    let pageGuard = 0;

    while (pageGuard < 100) {
        const params = {
            limit: FILTER_FETCH_BATCH_SIZE,
            offset
        };

        if (hasActiveItemFilter()) {
            params.status = itemListState.currentFilter;
            params.status_id = itemListState.currentFilter;
        }

        const response = await API.assets.fetchList(params);
        const pageItems = Array.isArray(response)
            ? response
            : (Array.isArray(response?.items) ? response.items : []);

        if (pageItems.length === 0) {
            break;
        }

        allItems.push(...pageItems);

        if (Array.isArray(response)) {
            break;
        }

        const total = Number(response?.total);
        if (Number.isFinite(total) && allItems.length >= total) {
            break;
        }

        const nextOffset = Number(response?.next_offset);
        if (Number.isFinite(nextOffset) && nextOffset > offset) {
            offset = nextOffset;
        } else if (pageItems.length < FILTER_FETCH_BATCH_SIZE) {
            break;
        } else {
            offset += FILTER_FETCH_BATCH_SIZE;
        }

        pageGuard += 1;
    }

    itemListState.filterCache.status = itemListState.currentFilter;
    itemListState.filterCache.items = allItems;
    return allItems;
}

async function loadItemPage(page = 1) {
    const tbody = document.getElementById('item-list-body');
    const loader = document.getElementById('loading-spinner');
    const safePage = Math.max(1, Number(page) || 1);
    hidePageFeedback('item-list-feedback');
    syncItemListPerPageSelect();
    const params = {
        limit: itemListState.itemsPerPage,
        offset: (safePage - 1) * itemListState.itemsPerPage
    };

    if (hasActiveItemFilter()) {
        params.status = itemListState.currentFilter;
        params.status_id = itemListState.currentFilter;
    }

    if (loader) {
        loader.style.display = 'block';
    }
    setItemListLoading(true);

    try {
        await ensureGenresLoaded();

        let normalized;

        if (hasActiveItemFilter()) {
            const filteredSource = await fetchAllFilteredItems();
            normalized = normalizePageResponse(filteredSource, {
                page: safePage,
                itemsPerPage: itemListState.itemsPerPage,
                localFilter: getItemFilterFn()
            });
        } else {
            const response = await API.assets.fetchList(params);
            normalized = normalizePageResponse(response, {
                page: safePage,
                itemsPerPage: itemListState.itemsPerPage
            });
        }

        itemListState.items = normalized.items;
        itemListState.totalItems = normalized.totalItems;
        itemListState.totalPages = normalized.totalPages;
        itemListState.currentPage = Math.min(safePage, normalized.totalPages);
        persistItemListState();

        renderList();
    } catch (error) {
        console.error('Fetch error:', error);
        itemListState.items = [];
        itemListState.totalItems = 0;
        itemListState.totalPages = 1;
        showPageFeedback('item-list-feedback', '備品一覧の取得に失敗しました。', 'error');

        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state table-empty-state-error">データの取得に失敗しました</td></tr>';
        }
    } finally {
        if (loader) {
            loader.style.display = 'none';
        }
        setItemListLoading(false);
    }
}

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

function buildListLabelRow(masterPayload, managementNumber) {
    const genre = AppState.getGenreById(masterPayload.genre_id, { all: true });
    const genreName = genre ? (genre.name ?? genre.genre_name ?? '-') : '-';

    return {
        checked: true,
        col_b: masterPayload.name || '',
        col_c: genreName,
        col_d: managementNumber || '',
        col_e: managementNumber || ''
    };
}

window.ItemListController = {
    async toggleFilter(status) {
        if (itemListState.loading) {
            return;
        }

        if (itemListState.currentFilter == status) {
            itemListState.currentFilter = '';
        } else {
            itemListState.currentFilter = status;
        }

        resetItemFilterCache();
        updateFilterButtonStyles();
        itemListState.currentPage = 1;
        persistItemListState();
        await loadItemPage(1);
    },

    editByIndex(index) {
        const item = itemListState.items[index];
        if (!item) {
            showPageFeedback('item-list-feedback', '対象データが見つかりません。', 'error');
            return;
        }

        this.edit(item.management_number || item.asset_id);
    },

    // 詳細・編集モーダルを開く
    async edit(managementNumber) {
        try {
            hidePageFeedback('item-list-feedback');
            const data = await API.assets.getPair(managementNumber);
            const asset = data.asset;
            const master = data.master;

            document.getElementById('edit-asset-id').value = asset.asset_id;
            document.getElementById('edit-name').value = master.name || '';
            document.getElementById('edit-code').value = asset.management_number;
            document.getElementById('edit-serial').value = asset.serial || '-';
            document.getElementById('disp-current-location').value = asset.location || '-';

            const qtyInput = document.getElementById('edit-qty');
            const qtyMsg = document.getElementById('qty-lock-msg');
            const statusSelect = document.getElementById('edit-status');
            const locInput = document.getElementById('edit-location');
            const notesInput = document.getElementById('edit-notes');
            const statusOriginalInput = document.getElementById('edit-status-original');

            qtyInput.value = asset.quantity;
            statusOriginalInput.value = String(asset.status_id);
            statusSelect.value = asset.status_id;
            locInput.value = asset.default_location || '';
            notesInput.value = asset.notes || '';

            statusSelect.disabled = false;
            locInput.disabled = false;
            notesInput.disabled = false;
            qtyInput.disabled = false;
            setReadonlyState(qtyInput, false);
            setReadonlyState(locInput, false);

            const isSerial = Boolean(asset.serial && asset.serial.trim() !== "");
            if (isSerial) {
                qtyInput.disabled = true;
                setReadonlyState(qtyInput, true);
                if (qtyMsg) qtyMsg.hidden = false;
            } else {
                qtyInput.disabled = false;
                setReadonlyState(qtyInput, false);
                if (qtyMsg) qtyMsg.hidden = true;
            }

            if (asset.status_id === 4) {
                statusSelect.disabled = true;
            }

            if (asset.status_id === 5) {
                statusSelect.disabled = true;
                qtyInput.disabled = true;
                locInput.disabled = true;
                setReadonlyState(qtyInput, true);
                setReadonlyState(locInput, true);
            }

            const editModal = document.getElementById('edit-modal');
            if (editModal) {
                editModal.hidden = false;
            }
        } catch (error) {
            console.error(error);
            showApiPageFeedback('item-list-feedback', error, 'データの取得に失敗しました。');
        }
    },

    closeModal() {
        const editModal = document.getElementById('edit-modal');
        if (editModal) {
            editModal.hidden = true;
        }
    },

    async update() {
        if (itemListState.updating) {
            return;
        }

        hidePageFeedback('item-list-edit-feedback');
        const id = document.getElementById('edit-asset-id').value;
        const statusSelect = document.getElementById('edit-status');
        const statusOriginalVal = document.getElementById('edit-status-original').value;
        const locVal = document.getElementById('edit-location').value;
        const notesVal = document.getElementById('edit-notes').value;

        let statusId;
        if (!statusSelect.disabled && statusSelect.value !== '') {
            statusId = Number(statusSelect.value);
        } else {
            statusId = Number(statusOriginalVal);
        }

        const payload = {
            status_id: statusId,
            default_location: locVal,
            notes: notesVal,
        };

        const qtyInput = document.getElementById('edit-qty');
        if (!qtyInput.disabled) {
            payload.quantity = Number(qtyInput.value);
        }

        itemListState.updating = true;
        setControlsDisabled([
            '#form-item-edit input',
            '#form-item-edit select',
            '#form-item-edit .back-btn'
        ], true);
        try {
            await runWithButtonLoading('#item-update-btn', { busyText: '更新中...' }, async () => {
                await API.assets.update(id, payload);
                this.closeModal();
                showPageFeedback('item-list-feedback', '更新しました。', 'success');
                resetItemFilterCache();
                await loadItemPage(itemListState.currentPage);
            });
        } catch (error) {
            console.error(error);
            showApiPageFeedback('item-list-edit-feedback', error, '更新に失敗しました。');
        } finally {
            itemListState.updating = false;
            setControlsDisabled([
                '#form-item-edit input',
                '#form-item-edit select',
                '#form-item-edit .back-btn'
            ], false);
        }
    },

    openLabelModal(managementNumber) {
        const modal = document.getElementById('label-modal');
        if (!modal) return;
        hidePageFeedback('item-list-label-feedback');
        mountDeviceStatusPanel('item-list-label-device-status', {
            title: '印刷機器',
            devices: ['tepra']
        });

        const mgmtHidden = document.getElementById('label-mgmt-number');
        const mgmtDisp = document.getElementById('label-target-display');
        const codeSel = document.getElementById('label-code-type');
        const widthSel = document.getElementById('label-tape-width');

        if (mgmtHidden) mgmtHidden.value = String(managementNumber);
        if (mgmtDisp) mgmtDisp.value = String(managementNumber);

        if (codeSel) codeSel.value = itemListState.label.codeType || 'QR';
        if (widthSel) widthSel.value = String(itemListState.label.tapeWidth || 9);

        modal.hidden = false;
    },

    openLabelModalByIndex(index) {
        const item = itemListState.items[index];
        if (!item) {
            showPageFeedback('item-list-feedback', '対象データが見つかりません。', 'error');
            return;
        }

        this.openLabelModal(item.management_number || item.asset_id);
    },

    closeLabelModal() {
        const modal = document.getElementById('label-modal');
        if (modal) modal.hidden = true;
    },

    async submitLabelPrint() {
        if (itemListState.labelPrinting) {
            return;
        }

        const mgmtHidden = document.getElementById('label-mgmt-number');
        const codeSel = document.getElementById('label-code-type');
        const widthSel = document.getElementById('label-tape-width');

        const managementNumber = mgmtHidden ? mgmtHidden.value : '';
        if (!managementNumber) {
            showPageFeedback('item-list-label-feedback', '管理番号が取得できません。', 'error');
            return;
        }

        const rawCode = codeSel ? codeSel.value : 'QR';
        const codeType = rawCode === 'CODE128' ? 'CODE128' : 'QR';

        let tapeWidth = 9;
        if (widthSel) {
            const parsedWidth = parseInt(widthSel.value, 10);
            tapeWidth = Number.isNaN(parsedWidth) ? 9 : parsedWidth;
        }

        itemListState.label.codeType = codeType;
        itemListState.label.tapeWidth = tapeWidth;
        itemListState.label.halfcut = true;

        await ensureGenresLoaded();

        itemListState.labelPrinting = true;
        setControlsDisabled([
            '#form-label-print select',
            '#form-label-print .back-btn'
        ], true);
        try {
            await runWithButtonLoading('#label-print-btn', { busyText: '印刷中...' }, async () => {
                const data = await API.assets.getPair(managementNumber);
                const master = data.master;

                const label = buildListLabelRow(master, managementNumber);
                const type = codeType === 'QR' ? 'qrcode' : 'code128';

                await printLabelsWithTepra(
                    [label],
                    tapeWidth,
                    type,
                    true
                );

                this.closeLabelModal();
                showPageFeedback('item-list-feedback', 'ラベル印刷を実行しました。', 'success');
            });
        } catch (error) {
            console.error('印刷エラー:', error);
            showApiPageFeedback('item-list-label-feedback', error, '印刷に失敗しました。');
        } finally {
            itemListState.labelPrinting = false;
            setControlsDisabled([
                '#form-label-print select',
                '#form-label-print .back-btn'
            ], false);
        }
    },

    async changePerPage(val) {
        if (itemListState.loading) {
            return;
        }

        itemListState.itemsPerPage = Number(val);
        itemListState.currentPage = 1;
        persistItemListState();
        await loadItemPage(1);
    },

    async changePage(page) {
        if (itemListState.loading) {
            return;
        }

        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > itemListState.totalPages) {
            return;
        }

        itemListState.currentPage = targetPage;
        persistItemListState();
        await loadItemPage(targetPage);
    },
};

function buildListPrintPayload(masterPayload, managementNumber, labelSetting) {
    const type = labelSetting.codeType === 'QR' ? 'qrcode' : 'code128';
    const genre = AppState.getGenreById(masterPayload.genre_id, { all: true });
    const genreName = genre ? (genre.name ?? genre.genre_name ?? '-') : '-';

    return {
        config: {
            use_halfcut: true,
            confirm_tape_width: false,
            enable_print_log: true,
        },
        label: {
            checked: true,
            col_b: masterPayload.name,
            col_c: genreName,
            col_d: managementNumber,
            col_e: managementNumber,
        },
        width: labelSetting.tapeWidth,
        type,
    };
}

// === 初期化処理 ===
export async function initItemList() {
    restoreItemListState();
    resetItemFilterCache();
    syncItemListPerPageSelect();
    updateFilterButtonStyles();
    hidePageFeedback('item-list-feedback');
    hidePageFeedback('item-list-edit-feedback');
    hidePageFeedback('item-list-label-feedback');
    mountDeviceStatusPanel('item-list-device-status', {
        title: '印刷機器',
        devices: ['tepra']
    });
    mountDeviceStatusPanel('item-list-label-device-status', {
        title: '印刷機器',
        devices: ['tepra']
    });

    const tbody = document.getElementById('item-list-body');
    if (tbody) {
        tbody.innerHTML = '';
    }

    await loadItemPage(itemListState.currentPage);
}

// === リスト描画 ===
function renderList() {
    const tbody = document.getElementById('item-list-body');
    const paginationDiv = document.getElementById('pagination-controls');
    if (!tbody) return;

    if (itemListState.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state">該当する備品はありません</td></tr>';
        if (paginationDiv) {
            paginationDiv.innerHTML = '';
        }
        return;
    }

    tbody.innerHTML = itemListState.items.map((item, index) => {
        const statusId = item.status_id || 1;
        const statusObj = STATUS_MAP[statusId] || { name: '不明', class: 'badge-gray' };
        const displayId = item.management_number || item.asset_id || '-';
        const displayName = item.name || `(マスタID: ${item.asset_master_id})`;

        return `
            <tr>
                <td class="table-cell-compact">${escapeHtml(displayId)}</td>
                <td class="table-cell-compact">${escapeHtml(displayName)}</td>
                <td class="table-cell-compact">${escapeHtml(item.quantity)}</td>
                <td class="table-cell-compact table-cell-center">
                    <span class="status-badge ${statusObj.class}">${statusObj.name}</span>
                </td>
                <td class="table-cell-compact table-cell-center">
                    <button class="sm-btn" onclick="ItemListController.editByIndex(${index})">詳細</button>
                    <button class="sm-btn" onclick="ItemListController.openLabelModalByIndex(${index})">ラベル印刷</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPaginationControls(paginationDiv, itemListState.totalPages, itemListState.currentPage);
}

// ページボタン生成ロジック
function renderPaginationControls(container, totalPages, currentPage) {
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn" ${prevDisabled} onclick="ItemListController.changePage(${currentPage - 1})">＜</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 10 && Math.abs(currentPage - i) > 2 && i !== 1 && i !== totalPages) {
            if (html.slice(-3) !== '...') {
                html += '<span class="pagination-ellipsis">...</span>';
            }
            continue;
        }

        const activeClass = i === currentPage ? 'active' : '';
        html += `<button class="page-btn ${activeClass}" onclick="ItemListController.changePage(${i})">${i}</button>`;
    }

    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn" ${nextDisabled} onclick="ItemListController.changePage(${currentPage + 1})">＞</button>`;

    container.innerHTML = html;
}

// === ボタンのアクティブ表示更新 ===
function updateFilterButtonStyles() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (String(btn.dataset.status) === String(itemListState.currentFilter)) {
            btn.classList.add('active');
        }
    });
}
