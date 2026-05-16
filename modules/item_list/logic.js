import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';

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
};

const FILTER_FETCH_BATCH_SIZE = 200;

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

        renderList();
    } catch (error) {
        console.error('Fetch error:', error);
        itemListState.items = [];
        itemListState.totalItems = 0;
        itemListState.totalPages = 1;

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">データの取得に失敗しました</td></tr>`;
        }
    } finally {
        if (loader) {
            loader.style.display = 'none';
        }
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
        if (itemListState.currentFilter == status) {
            itemListState.currentFilter = '';
        } else {
            itemListState.currentFilter = status;
        }

        resetItemFilterCache();
        updateFilterButtonStyles();
        await loadItemPage(1);
    },

    editByIndex(index) {
        const item = itemListState.items[index];
        if (!item) {
            alert('対象データが見つかりません');
            return;
        }

        this.edit(item.management_number || item.asset_id);
    },

    // 詳細・編集モーダルを開く
    async edit(managementNumber) {
        try {
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
            qtyInput.style.backgroundColor = "#fff";
            locInput.style.backgroundColor = "#fff";

            const isSerial = Boolean(asset.serial && asset.serial.trim() !== "");
            if (isSerial) {
                qtyInput.disabled = true;
                qtyInput.style.backgroundColor = "#f5f5f5";
                if (qtyMsg) qtyMsg.style.display = "inline";
            } else {
                qtyInput.disabled = false;
                qtyInput.style.backgroundColor = "#fff";
                if (qtyMsg) qtyMsg.style.display = "none";
            }

            if (asset.status_id === 4) {
                statusSelect.disabled = true;
            }

            if (asset.status_id === 5) {
                statusSelect.disabled = true;
                qtyInput.disabled = true;
                locInput.disabled = true;
                qtyInput.style.backgroundColor = "#f5f5f5";
                locInput.style.backgroundColor = "#f5f5f5";
            }

            document.getElementById('edit-modal').style.display = 'flex';
        } catch (error) {
            console.error(error);
            alert('データの取得に失敗しました');
        }
    },

    closeModal() {
        document.getElementById('edit-modal').style.display = 'none';
    },

    async update() {
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

        try {
            await API.assets.update(id, payload);
            alert('更新しました');
            this.closeModal();
            resetItemFilterCache();
            await loadItemPage(itemListState.currentPage);
        } catch (error) {
            console.error(error);
            alert('更新に失敗しました: ' + (error.response?.data?.error || error.message));
        }
    },

    openLabelModal(managementNumber) {
        const modal = document.getElementById('label-modal');
        if (!modal) return;

        const mgmtHidden = document.getElementById('label-mgmt-number');
        const mgmtDisp = document.getElementById('label-target-display');
        const codeSel = document.getElementById('label-code-type');
        const widthSel = document.getElementById('label-tape-width');

        if (mgmtHidden) mgmtHidden.value = String(managementNumber);
        if (mgmtDisp) mgmtDisp.value = String(managementNumber);

        if (codeSel) codeSel.value = itemListState.label.codeType || 'QR';
        if (widthSel) widthSel.value = String(itemListState.label.tapeWidth || 9);

        modal.style.display = 'flex';
    },

    openLabelModalByIndex(index) {
        const item = itemListState.items[index];
        if (!item) {
            alert('対象データが見つかりません');
            return;
        }

        this.openLabelModal(item.management_number || item.asset_id);
    },

    closeLabelModal() {
        const modal = document.getElementById('label-modal');
        if (modal) modal.style.display = 'none';
    },

    async submitLabelPrint() {
        const mgmtHidden = document.getElementById('label-mgmt-number');
        const codeSel = document.getElementById('label-code-type');
        const widthSel = document.getElementById('label-tape-width');
        const btn = document.getElementById('label-print-btn');

        const managementNumber = mgmtHidden ? mgmtHidden.value : '';
        if (!managementNumber) {
            alert('管理番号が取得できません');
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

        if (btn) {
            btn.disabled = true;
            btn.textContent = '印刷中...';
        }

        await ensureGenresLoaded();

        try {
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

            alert('ラベル印刷を実行しました');
            this.closeLabelModal();
        } catch (error) {
            console.error('印刷エラー:', error);
            alert('印刷に失敗しました: ' + (error.response?.data?.error || error.message));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '印刷';
            }
        }
    },

    async changePerPage(val) {
        itemListState.itemsPerPage = Number(val);
        await loadItemPage(1);
    },

    async changePage(page) {
        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > itemListState.totalPages) {
            return;
        }

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
    itemListState.currentFilter = '';
    itemListState.currentPage = 1;
    resetItemFilterCache();
    updateFilterButtonStyles();

    const tbody = document.getElementById('item-list-body');
    if (tbody) {
        tbody.innerHTML = '';
    }

    await loadItemPage(1);
}

// === リスト描画 ===
function renderList() {
    const tbody = document.getElementById('item-list-body');
    const paginationDiv = document.getElementById('pagination-controls');
    if (!tbody) return;

    if (itemListState.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">該当する備品はありません</td></tr>';
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
                <td style="padding: 12px 5px;">${escapeHtml(displayId)}</td>
                <td style="padding: 12px 5px;">${escapeHtml(displayName)}</td>
                <td style="padding: 12px 5px;">${escapeHtml(item.quantity)}</td>
                <td style="text-align:center; padding: 12px 5px;">
                    <span class="status-badge ${statusObj.class}">${statusObj.name}</span>
                </td>
                <td style="text-align:center; padding: 12px 5px;">
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
                html += '<span style="padding:0 5px;">...</span>';
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
