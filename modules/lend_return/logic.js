import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { escapeHtml, toDateInputValue } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';

const lendState = {
    data: {},
    history: {
        items: [],
        currentPage: 1,
        itemsPerPage: 20,
        filter: 'all',
        totalPages: 1,
        totalItems: 0
    }
};

const returnState = {
    targetLending: null,
    searchResults: [],
    inputData: {},
    history: {
        items: [],
        currentPage: 1,
        itemsPerPage: 20,
        totalPages: 1,
        totalItems: 0
    }
};

let isSubmittingLend = false;
let isSubmittingReturn = false;
const lendAssetNameCache = new Map();
const lendAssetNameRequestCache = new Map();

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
}

function toArray(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (data && Array.isArray(data.items)) {
        return data.items;
    }

    return [];
}

function formatDate(value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string') {
        if (value.length >= 10) {
            return value.slice(0, 10);
        }
        return value;
    }

    return String(value);
}

function getLendKey(item) {
    if (!item) {
        return '';
    }

    if (item.lend_ulid) {
        return item.lend_ulid;
    }
    if (item.lend_id !== undefined && item.lend_id !== null) {
        return String(item.lend_id);
    }
    if (item.lendingId) {
        return item.lendingId;
    }

    return '';
}

function getLendQuantity(item) {
    if (!item) {
        return 1;
    }

    if (item.quantity !== undefined && item.quantity !== null && item.quantity !== '') {
        return item.quantity;
    }
    if (item.qty !== undefined && item.qty !== null && item.qty !== '') {
        return item.qty;
    }

    return 1;
}

function displayHistoryValue(value, fallback = '-') {
    if (value === undefined || value === null) {
        return fallback;
    }

    const text = String(value).trim();
    return text === '' ? fallback : text;
}

function isTruthyFlag(value) {
    return value === true || value === 1 || value === '1' || value === '返却済み';
}

function isFalsyFlag(value) {
    return value === false || value === 0 || value === '0' || value === '未返却';
}

function isLendReturned(item) {
    const returnedFlag = item?.returned ?? item?.is_returned ?? item?.returned_flag;
    if (isTruthyFlag(returnedFlag)) {
        return true;
    }
    if (isFalsyFlag(returnedFlag)) {
        return false;
    }

    return Boolean(
        displayHistoryValue(item?.returned_at, '') !== ''
        || displayHistoryValue(item?.processed_at, '') !== ''
        || displayHistoryValue(item?.returned_on, '') !== ''
    );
}

function getLendHistoryFilterLabel(filter) {
    if (filter === 'active') {
        return '貸出中';
    }
    if (filter === 'returned') {
        return '返却済み';
    }
    return 'すべて';
}

function extractAssetNameFromPairResponse(response) {
    const name = response?.master?.name || response?.asset?.name || '';
    return typeof name === 'string' ? name.trim() : '';
}

async function fetchLendAssetName(managementNumber) {
    const key = String(managementNumber || '').trim();
    if (key === '') {
        return '';
    }

    if (lendAssetNameCache.has(key)) {
        return lendAssetNameCache.get(key);
    }

    if (lendAssetNameRequestCache.has(key)) {
        return lendAssetNameRequestCache.get(key);
    }

    const request = API.assets.getPair(key)
        .then((response) => {
            const assetName = extractAssetNameFromPairResponse(response);
            if (assetName !== '') {
                lendAssetNameCache.set(key, assetName);
            }
            return assetName;
        })
        .catch((error) => {
            console.warn('fetchLendAssetName error:', key, error);
            return '';
        })
        .finally(() => {
            lendAssetNameRequestCache.delete(key);
        });

    lendAssetNameRequestCache.set(key, request);
    return request;
}

async function enrichLendHistoryItemsWithAssetNames(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const uniqueManagementNumbers = Array.from(
        new Set(
            safeItems
                .map(item => String(item?.management_number || '').trim())
                .filter(value => value !== '')
        )
    );

    await Promise.all(uniqueManagementNumbers.map(fetchLendAssetName));

    return safeItems.map(item => {
        const managementNumber = String(item?.management_number || '').trim();
        return {
            ...item,
            asset_name: managementNumber === ''
                ? ''
                : (lendAssetNameCache.get(managementNumber) || item?.asset_name || '')
        };
    });
}

function getHistoryViewConfig(type) {
    if (type === 'return') {
        return {
            listId: 'return-history-list',
            paginationId: 'return-history-pagination',
            statusId: 'return-history-status',
            totalId: 'return-history-total',
            pageId: 'return-history-page',
            rangeId: 'return-history-range',
            perPageId: 'return-history-per-page',
            filterId: null,
            emptyTitle: '返却履歴がありません',
            emptyDescription: '返却処理がまだ登録されていないか、表示対象の履歴がありません。'
        };
    }

    return {
        listId: 'lend-history-list',
        paginationId: 'lend-history-pagination',
        statusId: 'lend-history-status',
        totalId: 'lend-history-total',
        pageId: 'lend-history-page',
        rangeId: 'lend-history-range',
        perPageId: 'lend-history-per-page',
        filterId: 'lend-history-filter',
        emptyTitle: '貸出履歴がありません',
        emptyDescription: '貸出処理がまだ登録されていないか、表示対象の履歴がありません。'
    };
}

function getHistoryDom(type) {
    const config = getHistoryViewConfig(type);
    return {
        config,
        list: document.getElementById(config.listId),
        pagination: document.getElementById(config.paginationId),
        status: document.getElementById(config.statusId),
        total: document.getElementById(config.totalId),
        page: document.getElementById(config.pageId),
        range: document.getElementById(config.rangeId),
        perPage: document.getElementById(config.perPageId),
        filter: config.filterId ? document.getElementById(config.filterId) : null
    };
}

function syncHistoryPerPageSelect(type, historyState) {
    const { perPage } = getHistoryDom(type);
    if (perPage) {
        perPage.value = String(historyState.itemsPerPage);
    }
}

function syncHistoryFilterSelect(type, historyState) {
    const { filter } = getHistoryDom(type);
    if (filter) {
        filter.value = historyState.filter || 'all';
    }
}

function updateHistorySummary(type, historyState) {
    const { total, page, range } = getHistoryDom(type);
    const safeTotalItems = Number(historyState.totalItems) || 0;
    const safeTotalPages = Math.max(1, Number(historyState.totalPages) || 1);
    const safeCurrentPage = Math.min(Math.max(1, Number(historyState.currentPage) || 1), safeTotalPages);

    if (total) {
        total.textContent = `${safeTotalItems}件`;
    }
    if (page) {
        page.textContent = `${safeCurrentPage} / ${safeTotalPages}`;
    }
    if (range) {
        if (safeTotalItems === 0) {
            range.textContent = '0件';
        } else {
            const start = (safeCurrentPage - 1) * historyState.itemsPerPage + 1;
            const end = Math.min(safeCurrentPage * historyState.itemsPerPage, safeTotalItems);
            range.textContent = `${start}-${end}件`;
        }
    }
}

function setHistoryStatus(type, message, tone = 'info') {
    const { status } = getHistoryDom(type);
    if (!status) {
        return;
    }

    status.className = `batch-status-banner ${tone}`;
    status.textContent = message;
}

function renderHistoryEmptyState(title, description) {
    return `
        <div class="history-empty-state">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(description)}</p>
        </div>
    `;
}

function renderHistoryLoadingState() {
    return `
        <div class="history-loading-grid">
            <div class="history-loading-card"></div>
            <div class="history-loading-card"></div>
            <div class="history-loading-card"></div>
        </div>
    `;
}

function renderHistoryField(label, value) {
    return `
        <div class="history-field">
            <span class="history-field-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(displayHistoryValue(value))}</strong>
        </div>
    `;
}

function renderLendHistoryRow(item) {
    const returned = isLendReturned(item);
    return `
        <tr>
            <td>${escapeHtml(displayHistoryValue(item.management_number))}</td>
            <td>${escapeHtml(displayHistoryValue(item.asset_name, '備品名未取得'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.borrower_id || item.borrower || ''))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.lent_at || item.created_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(getLendQuantity(item), '1'))}</td>
            <td>${returned ? 'true' : 'false'}</td>
        </tr>
    `;
}

function renderLendHistoryTable(items) {
    return `
        <table class="history-record-table">
            <thead>
                <tr>
                    <th>備品番号</th>
                    <th>備品名</th>
                    <th>貸出先</th>
                    <th>貸出日</th>
                    <th>数量</th>
                    <th>返却</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(renderLendHistoryRow).join('')}
            </tbody>
        </table>
    `;
}

function renderReturnHistoryRow(item) {
    return `
        <tr>
            <td>${escapeHtml(displayHistoryValue(item.management_number))}</td>
            <td>${escapeHtml(displayHistoryValue(item.borrower_id || item.borrower || ''))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.lent_at || item.lent_on || item.created_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.returned_at || item.processed_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.quantity || getLendQuantity(item), '1'))}</td>
        </tr>
    `;
}

function renderReturnHistoryTable(items) {
    return `
        <table class="history-record-table">
            <thead>
                <tr>
                    <th>備品番号</th>
                    <th>貸出先</th>
                    <th>貸出日</th>
                    <th>返却日</th>
                    <th>数量</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(renderReturnHistoryRow).join('')}
            </tbody>
        </table>
    `;
}

function showApiError(error, fallbackMessage) {
    const message = error?.response?.data?.message || error?.response?.data?.error || fallbackMessage;
    alert(message);
}

function assignHistoryPage(historyState, response, page) {
    const normalized = normalizePageResponse(response, {
        page,
        itemsPerPage: historyState.itemsPerPage
    });

    historyState.items = normalized.items;
    historyState.totalItems = normalized.totalItems;
    historyState.totalPages = normalized.totalPages;
    historyState.currentPage = Math.min(page, normalized.totalPages);
}

function renderReturnSelection() {
    const tbody = document.getElementById('return-search-result-body');
    if (!tbody) {
        return;
    }

    if (!returnState.searchResults || returnState.searchResults.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state">候補がありません</td></tr>';
        return;
    }

    tbody.innerHTML = returnState.searchResults.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.management_number || '')}</td>
            <td>${escapeHtml(getLendQuantity(item))}</td>
            <td>${escapeHtml(item.borrower_id || item.borrower || '')}</td>
            <td>${escapeHtml(formatDate(item.lent_at || item.created_at || ''))}</td>
            <td class="table-cell-center">
                <button class="sm-btn" onclick="LendReturnController.selectReturnTarget(${index})">選択</button>
            </td>
        </tr>
    `).join('');
}

function renderLendHistory() {
    const { list, pagination, config } = getHistoryDom('lend');
    if (!list) {
        return;
    }

    syncHistoryPerPageSelect('lend', lendState.history);
    syncHistoryFilterSelect('lend', lendState.history);
    updateHistorySummary('lend', lendState.history);

    if (!lendState.history.items || lendState.history.items.length === 0) {
        list.innerHTML = renderHistoryEmptyState(config.emptyTitle, config.emptyDescription);
        if (pagination) {
            pagination.innerHTML = '';
        }
        setHistoryStatus('lend', `${getLendHistoryFilterLabel(lendState.history.filter)}の履歴はありません。`, 'info');
        return;
    }

    list.innerHTML = renderLendHistoryTable(lendState.history.items);
    setHistoryStatus('lend', `${getLendHistoryFilterLabel(lendState.history.filter)}の履歴を ${lendState.history.totalItems}件表示しています。`, 'success');
    renderHistoryPagination(pagination, lendState.history.totalPages, lendState.history.currentPage, 'lend');
}

function renderReturnHistory() {
    const { list, pagination, config } = getHistoryDom('return');
    if (!list) {
        return;
    }

    syncHistoryPerPageSelect('return', returnState.history);
    updateHistorySummary('return', returnState.history);

    if (!returnState.history.items || returnState.history.items.length === 0) {
        list.innerHTML = renderHistoryEmptyState(config.emptyTitle, config.emptyDescription);
        if (pagination) {
            pagination.innerHTML = '';
        }
        setHistoryStatus('return', '表示できる返却履歴はありません。', 'info');
        return;
    }

    list.innerHTML = renderReturnHistoryTable(returnState.history.items);
    setHistoryStatus('return', `${returnState.history.totalItems}件の返却履歴を表示しています。`, 'success');
    renderHistoryPagination(pagination, returnState.history.totalPages, returnState.history.currentPage, 'return');
}

function renderHistoryPagination(container, totalPages, currentPage, type) {
    if (!container) {
        return;
    }

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    if (type === 'lend') {
        html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="LendReturnController.changeLendHistoryPage(${currentPage - 1})">＜</button>`;
    } else {
        html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="LendReturnController.changeReturnHistoryPage(${currentPage - 1})">＜</button>`;
    }

    const sequence = [];
    for (let i = 1; i <= totalPages; i += 1) {
        const shouldShow = totalPages <= 7 || i === 1 || i === totalPages || Math.abs(currentPage - i) <= 1;
        if (shouldShow) {
            sequence.push(i);
            continue;
        }

        if (sequence[sequence.length - 1] !== 'ellipsis') {
            sequence.push('ellipsis');
        }
    }

    for (let i = 0; i < sequence.length; i += 1) {
        if (sequence[i] === 'ellipsis') {
            html += '<span class="history-pagination-ellipsis">...</span>';
            continue;
        }

        const pageNumber = sequence[i];
        const activeClass = pageNumber === currentPage ? 'active' : '';
        if (type === 'lend') {
            html += `<button class="page-btn ${activeClass}" onclick="LendReturnController.changeLendHistoryPage(${pageNumber})">${pageNumber}</button>`;
        } else {
            html += `<button class="page-btn ${activeClass}" onclick="LendReturnController.changeReturnHistoryPage(${pageNumber})">${pageNumber}</button>`;
        }
    }

    if (type === 'lend') {
        html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="LendReturnController.changeLendHistoryPage(${currentPage + 1})">＞</button>`;
    } else {
        html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="LendReturnController.changeReturnHistoryPage(${currentPage + 1})">＞</button>`;
    }

    container.innerHTML = html;
}

window.LendReturnController = {
    async NfcRead(targetName) {
        const input = document.querySelector('input[name="' + targetName + '"]');

        if (!input) {
            console.error('target input not found:', targetName);
            return;
        }

        try {
            const { scanStudentIdWithRetry } = await loadNfcReader();
            const result = await scanStudentIdWithRetry(9, 2000);

            if (result.ok) {
                input.value = result.studentId;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            if (result.cancelled) {
                return;
            }

            alert('NFC読み取り失敗: ' + result.error);
        } catch (error) {
            console.error('scan error:', error);
            alert('NFC読み取り中にエラーが発生しました: ' + (error instanceof Error ? error.message : String(error)));
        }
    },

    saveLendInput() {
        const form = document.getElementById('form-lend');
        if (!form || !form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        lendState.data = {};
        for (const pair of formData.entries()) {
            lendState.data[pair[0]] = pair[1];
        }

        Router.to('lend-confirm');
    },

    async submitLend() {
        if (isSubmittingLend) {
            return;
        }

        isSubmittingLend = true;

        try {
            const payload = {
                management_number: lendState.data.itemId,
                quantity: Number(lendState.data.qty),
                borrower_id: lendState.data.borrower,
                due_on: lendState.data.dueDate ? lendState.data.dueDate : null,
                lent_by_id: lendState.data.lender ? lendState.data.lender : null
            };

            console.log('submit lend payload:', payload);

            await API.lending.register(payload);

            lendState.data = {};
            alert('貸出登録が完了しました');
            Router.to('lend-input');
        } catch (error) {
            console.error('submitLend error:', error);
            showApiError(error, '貸出登録に失敗しました');
        } finally {
            isSubmittingLend = false;
        }
    },

    async triggerQuickReturn(lendKey) {
        if (!lendKey) {
            alert('貸出番号が取得できません');
            return;
        }

        try {
            const result = await API.lending.getLend(lendKey);
            returnState.targetLending = result;
            returnState.searchResults = [];
            Router.to('return-input');
        } catch (error) {
            console.error('triggerQuickReturn error:', error);
            showApiError(error, '返却対象の取得に失敗しました');
        }
    },

    async searchLending() {
        const input = document.getElementById('return-search-query');
        const query = input ? input.value.trim() : '';

        if (!query) {
            alert('備品番号または貸出先を入力してください');
            return;
        }

        try {
            let list = toArray(await API.lending.fetchLends({
                management_number: query,
                returned: false,
                limit: 20
            }));

            if (list.length === 0) {
                list = toArray(await API.lending.fetchLends({
                    borrower_id: query,
                    returned: false,
                    limit: 20
                }));
            }

            if (list.length === 0) {
                alert('該当する貸出情報が見つかりません');
                return;
            }

            if (list.length === 1) {
                returnState.targetLending = list[0];
                returnState.searchResults = [];
                Router.to('return-input');
                return;
            }

            returnState.targetLending = null;
            returnState.searchResults = list;
            Router.to('return-select');
        } catch (error) {
            console.error('searchLending error:', error);
            showApiError(error, '貸出検索に失敗しました');
        }
    },

    selectReturnTarget(index) {
        const target = returnState.searchResults[index];
        if (!target) {
            alert('返却候補が見つかりません');
            return;
        }

        returnState.targetLending = target;
        Router.to('return-input');
    },

    backToReturnSearch() {
        returnState.targetLending = null;
        returnState.searchResults = [];
        Router.to('return-search');
    },

    saveReturnInput() {
        const form = document.getElementById('form-return');
        if (!form || !form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        returnState.inputData = {};
        for (const pair of formData.entries()) {
            returnState.inputData[pair[0]] = pair[1];
        }

        Router.to('return-confirm');
    },

    async submitReturn() {
        if (isSubmittingReturn) {
            return;
        }

        if (!returnState.targetLending) {
            alert('返却対象がありません');
            return;
        }

        const lendKey = getLendKey(returnState.targetLending);
        if (!lendKey) {
            alert('貸出番号が取得できません');
            return;
        }

        isSubmittingReturn = true;

        try {
            const payload = {
                quantity: Number(returnState.inputData.returnQty || getLendQuantity(returnState.targetLending) || 1),
                processed_by_id: returnState.inputData.returner,
                note: returnState.inputData.note ? returnState.inputData.note : null
            };

            console.log('submit return payload:', payload);

            await API.lending.returnAsset(lendKey, payload);

            returnState.targetLending = null;
            returnState.searchResults = [];
            returnState.inputData = {};

            alert('返却処理が完了しました');
            Router.to('return-search');
        } catch (error) {
            console.error('submitReturn error:', error);
            showApiError(error, '返却処理に失敗しました');
        } finally {
            isSubmittingReturn = false;
        }
    },

    async changeLendHistoryPerPage(value) {
        lendState.history.itemsPerPage = Number(value);
        await this.loadLendHistory(1);
    },

    async changeLendHistoryFilter(value) {
        lendState.history.filter = value || 'all';
        await this.loadLendHistory(1);
    },

    async changeLendHistoryPage(page) {
        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > lendState.history.totalPages) {
            return;
        }

        await this.loadLendHistory(targetPage);
    },

    async changeReturnHistoryPerPage(value) {
        returnState.history.itemsPerPage = Number(value);
        await this.loadReturnHistory(1);
    },

    async changeReturnHistoryPage(page) {
        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > returnState.history.totalPages) {
            return;
        }

        await this.loadReturnHistory(targetPage);
    },

    async loadLendHistory(page = 1) {
        const { list, pagination } = getHistoryDom('lend');
        if (!list) {
            return;
        }

        setHistoryStatus('lend', '貸出履歴を読み込んでいます。', 'info');
        list.innerHTML = renderHistoryLoadingState();
        updateHistorySummary('lend', {
            ...lendState.history,
            currentPage: page
        });
        if (pagination) {
            pagination.innerHTML = '';
        }

        try {
            const params = {
                limit: lendState.history.itemsPerPage,
                offset: (page - 1) * lendState.history.itemsPerPage
            };
            if (lendState.history.filter === 'active') {
                params.returned = false;
            } else if (lendState.history.filter === 'returned') {
                params.returned = true;
            }

            const response = await API.lending.fetchLends(params);

            assignHistoryPage(lendState.history, response, page);
            lendState.history.items = await enrichLendHistoryItemsWithAssetNames(lendState.history.items);
            renderLendHistory();
        } catch (error) {
            console.error('loadLendHistory error:', error);
            list.innerHTML = renderHistoryEmptyState('貸出履歴を読み込めませんでした', '時間をおいて再度お試しください。');
            setHistoryStatus('lend', '貸出履歴の読み込みに失敗しました。', 'error');
            updateHistorySummary('lend', {
                ...lendState.history,
                totalItems: 0,
                totalPages: 1,
                currentPage: 1
            });
            if (pagination) {
                pagination.innerHTML = '';
            }
        }
    },

    async loadReturnHistory(page = 1) {
        const { list, pagination } = getHistoryDom('return');
        if (!list) {
            return;
        }

        setHistoryStatus('return', '返却履歴を読み込んでいます。', 'info');
        list.innerHTML = renderHistoryLoadingState();
        updateHistorySummary('return', {
            ...returnState.history,
            currentPage: page
        });
        if (pagination) {
            pagination.innerHTML = '';
        }

        try {
            const response = await API.lending.fetchReturns({
                limit: returnState.history.itemsPerPage,
                offset: (page - 1) * returnState.history.itemsPerPage
            });

            assignHistoryPage(returnState.history, response, page);
            renderReturnHistory();
        } catch (error) {
            console.error('loadReturnHistory error:', error);
            list.innerHTML = renderHistoryEmptyState('返却履歴を読み込めませんでした', '時間をおいて再度お試しください。');
            setHistoryStatus('return', '返却履歴の読み込みに失敗しました。', 'error');
            updateHistorySummary('return', {
                ...returnState.history,
                totalItems: 0,
                totalPages: 1,
                currentPage: 1
            });
            if (pagination) {
                pagination.innerHTML = '';
            }
        }
    },
};

export function initLendReturn(view) {
    if (view === 'lend-confirm') {
        const display = document.getElementById('lend-confirm-view');
        if (display) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${escapeHtml(lendState.data.itemId || '')}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${escapeHtml(lendState.data.qty || '')}</span></div>
                <div class="info-row"><span class="info-label">貸出先</span><span>${escapeHtml(lendState.data.borrower || '')}</span></div>
                <div class="info-row"><span class="info-label">返却予定</span><span>${escapeHtml(lendState.data.dueDate || '')}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${escapeHtml(lendState.data.lender || '')}</span></div>
            `;
        }
    } else if (view === 'return-select') {
        renderReturnSelection();
    } else if (view === 'return-input') {
        const target = returnState.targetLending;
        if (!target) {
            alert('不正な遷移です');
            Router.to('return-search');
            return;
        }

        const lendingIdInput = document.getElementById('disp-lending-id');
        const qtyInput = document.getElementById('disp-qty');
        const borrowerInput = document.getElementById('disp-borrower');
        const dateInput = document.querySelector('input[name="returnDate"]');

        if (lendingIdInput) {
            lendingIdInput.value = getLendKey(target);
        }
        if (qtyInput) {
            qtyInput.value = getLendQuantity(target);
        }
        if (borrowerInput) {
            borrowerInput.value = target.borrower_id || target.borrower || '';
        }
        if (dateInput) {
            dateInput.value = toDateInputValue(new Date());
        }
    } else if (view === 'return-confirm') {
        const display = document.getElementById('return-confirm-view');
        const target = returnState.targetLending;
        const input = returnState.inputData;

        if (display && target) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">貸出番号</span><span class="inline-key">${escapeHtml(getLendKey(target))}</span></div>
                <div class="info-row"><span class="info-label">備品番号</span><span>${escapeHtml(target.management_number || target.itemId || '')}</span></div>
                <div class="info-row"><span class="info-label">返却日</span><span>${escapeHtml(input.returnDate || '')}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${escapeHtml(input.returner || '')}</span></div>
            `;
        }
    }

    if (view === 'lend-history') {
        window.LendReturnController.loadLendHistory(1);
    } else if (view === 'return-history') {
        window.LendReturnController.loadReturnHistory(1);
    }
}
