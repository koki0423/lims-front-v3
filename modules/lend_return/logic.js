import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { escapeHtml, toDateInputValue } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';
import { mountAssetPreview } from '../../js/asset_preview.js';
import { mountDeviceStatusPanel } from '../../js/device_status.js';
import { runWithButtonLoading, setControlsDisabled } from '../../js/ui_loading.js';
import { clearFeedbackInContainer, clearFieldFeedback, hidePageFeedback, setFieldFeedback, showApiPageFeedback, showPageFeedback } from '../../js/ui_feedback.js';
import { loadViewState, saveViewState } from '../../js/view_state.js';

const lendState = {
    data: {},
    history: {
        items: [],
        sourceItems: null,
        sourceCacheKey: '',
        currentPage: 1,
        itemsPerPage: 20,
        filter: 'all',
        totalPages: 1,
        totalItems: 0,
        loading: false,
        detailItem: null,
        query: {
            managementNumber: '',
            assetName: '',
            borrower: '',
            dateFrom: '',
            dateTo: ''
        }
    }
};

const returnState = {
    targetLending: null,
    searchResults: [],
    inputData: {},
    history: {
        items: [],
        sourceItems: null,
        sourceCacheKey: '',
        currentPage: 1,
        itemsPerPage: 20,
        totalPages: 1,
        totalItems: 0,
        loading: false,
        detailItem: null,
        query: {
            managementNumber: '',
            assetName: '',
            borrower: '',
            dateFrom: '',
            dateTo: ''
        }
    }
};

let isSubmittingLend = false;
let isSubmittingReturn = false;
let isSearchingLending = false;
const lendAssetDetailsCache = new Map();
const lendAssetDetailsRequestCache = new Map();
const lendRecordCache = new Map();
const lendRecordRequestCache = new Map();
const historyFilterUiState = {
    lend: false,
    return: false
};
const LEND_HISTORY_VIEW_STATE_KEY = 'lend-history-view';
const RETURN_HISTORY_VIEW_STATE_KEY = 'return-history-view';
const LEND_RETURN_FEEDBACK_IDS = [
    'lend-input-feedback',
    'return-input-feedback',
    'return-search-feedback',
    'lend-confirm-feedback',
    'return-confirm-feedback'
];

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
}

function createHistoryQuery(overrides = {}) {
    return {
        managementNumber: '',
        assetName: '',
        borrower: '',
        dateFrom: '',
        dateTo: '',
        ...overrides
    };
}

function restoreLendHistoryState() {
    const persisted = loadViewState(LEND_HISTORY_VIEW_STATE_KEY, {});
    lendState.history.currentPage = Math.max(1, Number(persisted.currentPage) || 1);
    lendState.history.itemsPerPage = [10, 20, 50, 100].includes(Number(persisted.itemsPerPage))
        ? Number(persisted.itemsPerPage)
        : 20;
    lendState.history.filter = persisted.filter || 'all';
    lendState.history.query = createHistoryQuery(persisted.query);
}

function persistLendHistoryState() {
    saveViewState(LEND_HISTORY_VIEW_STATE_KEY, {
        currentPage: lendState.history.currentPage,
        itemsPerPage: lendState.history.itemsPerPage,
        filter: lendState.history.filter,
        query: lendState.history.query
    });
}

function restoreReturnHistoryState() {
    const persisted = loadViewState(RETURN_HISTORY_VIEW_STATE_KEY, {});
    returnState.history.currentPage = Math.max(1, Number(persisted.currentPage) || 1);
    returnState.history.itemsPerPage = [10, 20, 50, 100].includes(Number(persisted.itemsPerPage))
        ? Number(persisted.itemsPerPage)
        : 20;
    returnState.history.query = createHistoryQuery(persisted.query);
}

function persistReturnHistoryState() {
    saveViewState(RETURN_HISTORY_VIEW_STATE_KEY, {
        currentPage: returnState.history.currentPage,
        itemsPerPage: returnState.history.itemsPerPage,
        query: returnState.history.query
    });
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

function normalizeTextValue(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
}

function getLendManagementNumber(item) {
    return normalizeTextValue(item?.management_number || item?.itemId);
}

function getLendAssetName(item) {
    return normalizeTextValue(item?.asset_name || item?.name);
}

function getLendAssetSerial(item) {
    return normalizeTextValue(item?.serial || item?.asset_serial || item?.serial_number);
}

function getLendRecordKey(item) {
    if (!item) {
        return '';
    }

    if (item.lend_id !== undefined && item.lend_id !== null && item.lend_id !== '') {
        return String(item.lend_id).trim();
    }

    return getLendKey(item);
}

function displayHistoryValue(value, fallback = '-') {
    if (value === undefined || value === null) {
        return fallback;
    }

    const text = String(value).trim();
    return text === '' ? fallback : text;
}

function normalizeFilterText(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

function includesFilterText(value, query) {
    const safeQuery = normalizeFilterText(query);
    if (!safeQuery) {
        return true;
    }

    return normalizeFilterText(value).includes(safeQuery);
}

function toDateOnlyValue(value) {
    const safeValue = displayHistoryValue(value, '');
    if (!safeValue) {
        return '';
    }

    if (typeof safeValue === 'string' && safeValue.length >= 10) {
        return safeValue.slice(0, 10);
    }

    const date = new Date(safeValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().slice(0, 10);
}

function matchesDateRange(value, dateFrom, dateTo) {
    const dateValue = toDateOnlyValue(value);
    if (!dateValue) {
        return !dateFrom && !dateTo;
    }

    if (dateFrom && dateValue < dateFrom) {
        return false;
    }
    if (dateTo && dateValue > dateTo) {
        return false;
    }

    return true;
}

function hasActiveHistoryQuery(query) {
    return Boolean(
        query?.managementNumber
        || query?.assetName
        || query?.borrower
        || query?.dateFrom
        || query?.dateTo
    );
}

function clearHistorySourceCache(type) {
    const target = type === 'return' ? returnState.history : lendState.history;
    target.sourceItems = null;
    target.sourceCacheKey = '';
}

async function showLendReturnComplete(options) {
    await import('../common/logic.js');
    if (window.CommonController?.showComplete) {
        await window.CommonController.showComplete(options);
        return;
    }

    await Router.to('complete');
}

function getActiveFeedbackId() {
    return LEND_RETURN_FEEDBACK_IDS.find((id) => document.getElementById(id)) || '';
}

function clearActiveFeedback() {
    const feedbackId = getActiveFeedbackId();
    if (feedbackId) {
        hidePageFeedback(feedbackId);
    }
}

function showActiveFeedback(message, tone = 'info') {
    const feedbackId = getActiveFeedbackId();
    if (feedbackId) {
        showPageFeedback(feedbackId, message, tone);
    }
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

function extractAssetDetailsFromPairResponse(response) {
    return {
        asset_name: normalizeTextValue(response?.master?.name || response?.asset?.name),
        serial: normalizeTextValue(response?.asset?.serial)
    };
}

async function fetchLendAssetDetails(managementNumber) {
    const key = String(managementNumber || '').trim();
    if (key === '') {
        return { asset_name: '', serial: '' };
    }

    if (lendAssetDetailsCache.has(key)) {
        return lendAssetDetailsCache.get(key);
    }

    if (lendAssetDetailsRequestCache.has(key)) {
        return lendAssetDetailsRequestCache.get(key);
    }

    const request = API.assets.getPair(key)
        .then((response) => {
            const assetDetails = extractAssetDetailsFromPairResponse(response);
            lendAssetDetailsCache.set(key, assetDetails);
            return assetDetails;
        })
        .catch((error) => {
            console.warn('fetchLendAssetDetails error:', key, error);
            return { asset_name: '', serial: '' };
        })
        .finally(() => {
            lendAssetDetailsRequestCache.delete(key);
        });

    lendAssetDetailsRequestCache.set(key, request);
    return request;
}

async function fetchRequiredLendAssetDetails(managementNumber) {
    const key = String(managementNumber || '').trim();
    if (key === '') {
        throw new Error('備品番号が未入力です');
    }

    if (lendAssetDetailsCache.has(key)) {
        return lendAssetDetailsCache.get(key);
    }

    const response = await API.assets.getPair(key);
    const assetDetails = extractAssetDetailsFromPairResponse(response);
    lendAssetDetailsCache.set(key, assetDetails);
    return assetDetails;
}

async function fetchLendRecord(lendKey) {
    const key = String(lendKey || '').trim();
    if (key === '') {
        return null;
    }

    if (lendRecordCache.has(key)) {
        return lendRecordCache.get(key);
    }

    if (lendRecordRequestCache.has(key)) {
        return lendRecordRequestCache.get(key);
    }

    const request = API.lending.getLend(key)
        .then((response) => {
            lendRecordCache.set(key, response);
            return response;
        })
        .catch((error) => {
            console.warn('fetchLendRecord error:', key, error);
            return null;
        })
        .finally(() => {
            lendRecordRequestCache.delete(key);
        });

    lendRecordRequestCache.set(key, request);
    return request;
}

function mergeLendItemWithAssetDetails(item, assetDetails = null) {
    return {
        ...item,
        asset_name: getLendAssetName(item) || assetDetails?.asset_name || '',
        serial: getLendAssetSerial(item) || assetDetails?.serial || ''
    };
}

async function enrichLendItemsWithAssetDetails(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const uniqueManagementNumbers = Array.from(
        new Set(
            safeItems
                .filter(item => {
                    const managementNumber = getLendManagementNumber(item);
                    return managementNumber !== '' && (getLendAssetName(item) === '' || getLendAssetSerial(item) === '');
                })
                .map(getLendManagementNumber)
        )
    );

    await Promise.all(uniqueManagementNumbers.map(fetchLendAssetDetails));

    return safeItems.map(item => {
        const managementNumber = getLendManagementNumber(item);
        const assetDetails = managementNumber === ''
            ? null
            : lendAssetDetailsCache.get(managementNumber);
        return mergeLendItemWithAssetDetails(item, assetDetails);
    });
}

async function enrichReturnHistoryItems(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const uniqueLendKeys = Array.from(
        new Set(
            safeItems
                .map(getLendRecordKey)
                .filter(value => value !== '')
        )
    );

    await Promise.all(uniqueLendKeys.map(fetchLendRecord));

    return safeItems.map(item => {
        const lendRecord = lendRecordCache.get(getLendRecordKey(item));
        if (!lendRecord) {
            return item;
        }

        return {
            ...item,
            management_number: normalizeTextValue(item.management_number) || normalizeTextValue(lendRecord.management_number),
            borrower_id: normalizeTextValue(item.borrower_id || item.borrower) || normalizeTextValue(lendRecord.borrower_id || lendRecord.borrower),
            lent_at: item.lent_at || lendRecord.lent_at || null
        };
    });
}

async function fetchAllHistoryItems(fetcher, params = {}) {
    const allItems = [];
    let offset = 0;
    let pageGuard = 0;

    while (pageGuard < 100) {
        const response = await fetcher({
            ...params,
            limit: 200,
            offset
        });
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
        } else if (pageItems.length < 200) {
            break;
        } else {
            offset += 200;
        }

        pageGuard += 1;
    }

    return allItems;
}

async function getLendHistorySourceItems() {
    const cacheKey = lendState.history.filter;
    if (
        Array.isArray(lendState.history.sourceItems)
        && lendState.history.sourceCacheKey === cacheKey
    ) {
        return lendState.history.sourceItems;
    }

    const params = {};
    if (lendState.history.filter === 'active') {
        params.returned = false;
    } else if (lendState.history.filter === 'returned') {
        params.returned = true;
    }

    const items = await fetchAllHistoryItems(API.lending.fetchLends, params);
    const enrichedItems = await enrichLendItemsWithAssetDetails(items);
    lendState.history.sourceItems = enrichedItems;
    lendState.history.sourceCacheKey = cacheKey;
    return enrichedItems;
}

async function getReturnHistorySourceItems() {
    const cacheKey = 'all';
    if (
        Array.isArray(returnState.history.sourceItems)
        && returnState.history.sourceCacheKey === cacheKey
    ) {
        return returnState.history.sourceItems;
    }

    const items = await fetchAllHistoryItems(API.lending.fetchReturns);
    const enrichedItems = await enrichReturnHistoryItems(items);
    returnState.history.sourceItems = enrichedItems;
    returnState.history.sourceCacheKey = cacheKey;
    return enrichedItems;
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
            queryFormId: 'return-history-query-form',
            queryToggleId: 'return-history-query-toggle-btn',
            queryIds: {
                managementNumber: 'return-history-query-mgmt',
                assetName: 'return-history-query-name',
                borrower: 'return-history-query-borrower',
                dateFrom: 'return-history-date-from',
                dateTo: 'return-history-date-to',
                apply: 'return-history-apply-btn',
                clear: 'return-history-clear-btn'
            },
            detailModalId: 'return-history-detail-modal',
            detailContentId: 'return-history-detail-content',
            detailCloseId: 'return-history-detail-close-btn',
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
        queryFormId: 'lend-history-query-form',
        queryToggleId: 'lend-history-query-toggle-btn',
        queryIds: {
            managementNumber: 'lend-history-query-mgmt',
            assetName: 'lend-history-query-name',
            borrower: 'lend-history-query-borrower',
            dateFrom: 'lend-history-date-from',
            dateTo: 'lend-history-date-to',
            apply: 'lend-history-apply-btn',
            clear: 'lend-history-clear-btn'
        },
        detailModalId: 'lend-history-detail-modal',
        detailContentId: 'lend-history-detail-content',
        detailCloseId: 'lend-history-detail-close-btn',
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
        filter: config.filterId ? document.getElementById(config.filterId) : null,
        queryForm: document.getElementById(config.queryFormId),
        queryToggle: document.getElementById(config.queryToggleId),
        queryManagementNumber: document.getElementById(config.queryIds.managementNumber),
        queryAssetName: document.getElementById(config.queryIds.assetName),
        queryBorrower: document.getElementById(config.queryIds.borrower),
        queryDateFrom: document.getElementById(config.queryIds.dateFrom),
        queryDateTo: document.getElementById(config.queryIds.dateTo),
        queryApply: document.getElementById(config.queryIds.apply),
        queryClear: document.getElementById(config.queryIds.clear),
        detailModal: document.getElementById(config.detailModalId),
        detailContent: document.getElementById(config.detailContentId),
        detailClose: document.getElementById(config.detailCloseId)
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

function setHistoryControlsLoading(type, isLoading) {
    const { config } = getHistoryDom(type);
    const selectors = [
        `#${config.perPageId}`,
        `#${config.paginationId} .page-btn`
    ];

    if (config.filterId) {
        selectors.push(`#${config.filterId}`);
    }
    selectors.push(
        `#${config.queryToggleId}`,
        `#${config.queryIds.managementNumber}`,
        `#${config.queryIds.assetName}`,
        `#${config.queryIds.borrower}`,
        `#${config.queryIds.dateFrom}`,
        `#${config.queryIds.dateTo}`,
        `#${config.queryIds.apply}`,
        `#${config.queryIds.clear}`,
        `#${config.listId} .sm-btn`
    );

    if (type === 'lend') {
        lendState.history.loading = isLoading;
    } else {
        returnState.history.loading = isLoading;
    }

    setControlsDisabled(selectors, isLoading);
}

function getHistoryState(type) {
    return type === 'return' ? returnState.history : lendState.history;
}

function syncHistoryQueryInputs(type, historyState) {
    const dom = getHistoryDom(type);
    if (dom.queryManagementNumber) {
        dom.queryManagementNumber.value = historyState.query.managementNumber || '';
    }
    if (dom.queryAssetName) {
        dom.queryAssetName.value = historyState.query.assetName || '';
    }
    if (dom.queryBorrower) {
        dom.queryBorrower.value = historyState.query.borrower || '';
    }
    if (dom.queryDateFrom) {
        dom.queryDateFrom.value = historyState.query.dateFrom || '';
    }
    if (dom.queryDateTo) {
        dom.queryDateTo.value = historyState.query.dateTo || '';
    }
}

function syncHistoryFilterPanel(type, historyState) {
    const dom = getHistoryDom(type);
    if (!dom.queryForm || !dom.queryToggle) {
        return;
    }

    const isExpanded = historyFilterUiState[type] === true;
    dom.queryForm.hidden = !isExpanded;
    dom.queryToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    dom.queryToggle.textContent = `${isExpanded ? '絞り込み条件を閉じる' : '絞り込み条件を開く'}${hasActiveHistoryQuery(historyState.query) ? '（適用中）' : ''}`;
}

function setHistoryFilterExpanded(type, isExpanded) {
    historyFilterUiState[type] = isExpanded;
    syncHistoryFilterPanel(type, getHistoryState(type));
}

function toggleHistoryFilterPanel(type) {
    setHistoryFilterExpanded(type, !historyFilterUiState[type]);
}

function readHistoryQueryFromInputs(type) {
    const dom = getHistoryDom(type);
    return createHistoryQuery({
        managementNumber: dom.queryManagementNumber ? dom.queryManagementNumber.value.trim() : '',
        assetName: dom.queryAssetName ? dom.queryAssetName.value.trim() : '',
        borrower: dom.queryBorrower ? dom.queryBorrower.value.trim() : '',
        dateFrom: dom.queryDateFrom ? dom.queryDateFrom.value : '',
        dateTo: dom.queryDateTo ? dom.queryDateTo.value : ''
    });
}

function filterLendHistoryItems(items) {
    const query = lendState.history.query;
    return (Array.isArray(items) ? items : []).filter((item) => {
        if (lendState.history.filter === 'active' && isLendReturned(item)) {
            return false;
        }
        if (lendState.history.filter === 'returned' && !isLendReturned(item)) {
            return false;
        }

        if (!includesFilterText(getLendManagementNumber(item), query.managementNumber)) {
            return false;
        }
        if (!includesFilterText(getLendAssetName(item), query.assetName)) {
            return false;
        }
        if (!includesFilterText(item.borrower_id || item.borrower || '', query.borrower)) {
            return false;
        }

        return matchesDateRange(item.lent_at || item.created_at || '', query.dateFrom, query.dateTo);
    });
}

function filterReturnHistoryItems(items) {
    const query = returnState.history.query;
    return (Array.isArray(items) ? items : []).filter((item) => {
        if (!includesFilterText(getLendManagementNumber(item), query.managementNumber)) {
            return false;
        }
        if (!includesFilterText(getLendAssetName(item), query.assetName)) {
            return false;
        }
        if (!includesFilterText(item.borrower_id || item.borrower || '', query.borrower)) {
            return false;
        }

        return matchesDateRange(item.returned_at || item.processed_at || item.returned_on || '', query.dateFrom, query.dateTo);
    });
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

function renderHistoryDetailGrid(rows) {
    return `
        <div class="history-detail-grid">
            ${rows.map(([label, value]) => renderHistoryField(label, value)).join('')}
        </div>
    `;
}

let activeHistoryDetailContext = null;

function openHistoryDetailModal(type) {
    const historyState = getHistoryState(type);
    const dom = getHistoryDom(type);
    if (!historyState.detailItem || !dom.detailModal || !dom.detailContent) {
        return;
    }

    const item = historyState.detailItem;
    if (type === 'lend') {
        const returned = isLendReturned(item);
        dom.detailContent.innerHTML = `
            <div class="history-detail-status ${returned ? 'is-complete' : 'is-active'}">${returned ? '返却済み' : '貸出中'}</div>
            ${renderHistoryDetailGrid([
                ['貸出番号', getLendKey(item)],
                ['備品番号', getLendManagementNumber(item)],
                ['備品名', getLendAssetName(item) || '備品名未取得'],
                ['シリアル番号', getLendAssetSerial(item)],
                ['貸出先', item.borrower_id || item.borrower || ''],
                ['貸出日', formatDate(item.lent_at || item.created_at || '')],
                ['数量', getLendQuantity(item)],
                ['返却日', formatDate(item.returned_at || item.processed_at || item.returned_on || '')],
                ['貸出担当者', item.lent_by_id || '']
            ])}
        `;
    } else {
        dom.detailContent.innerHTML = `
            <div class="history-detail-status is-complete">返却済み</div>
            ${renderHistoryDetailGrid([
                ['貸出番号', getLendKey(item)],
                ['備品番号', getLendManagementNumber(item)],
                ['備品名', getLendAssetName(item) || '備品名未取得'],
                ['シリアル番号', getLendAssetSerial(item)],
                ['貸出先', item.borrower_id || item.borrower || ''],
                ['貸出日', formatDate(item.lent_at || item.lent_on || item.created_at || '')],
                ['返却日', formatDate(item.returned_at || item.processed_at || item.returned_on || '')],
                ['数量', item.quantity || getLendQuantity(item)],
                ['返却担当者', item.processed_by_id || item.returned_by_id || '']
            ])}
            ${item.note ? `<div class="history-detail-note">${escapeHtml(item.note)}</div>` : ''}
        `;
    }

    activeHistoryDetailContext = {
        type,
        returnFocusTo: document.activeElement instanceof Element ? document.activeElement : null
    };
    dom.detailModal.hidden = false;
    document.body.classList.add('dialog-open');
    dom.detailClose?.focus();
}

function closeHistoryDetailModal(type) {
    const historyState = getHistoryState(type);
    const dom = getHistoryDom(type);
    if (!dom.detailModal) {
        return;
    }

    dom.detailModal.hidden = true;
    historyState.detailItem = null;
    document.body.classList.remove('dialog-open');

    if (
        activeHistoryDetailContext
        && activeHistoryDetailContext.type === type
        && activeHistoryDetailContext.returnFocusTo instanceof Element
    ) {
        activeHistoryDetailContext.returnFocusTo.focus();
    }
    activeHistoryDetailContext = null;
}

function renderLendHistoryRow(item, index) {
    const returned = isLendReturned(item);
    return `
        <tr>
            <td>${escapeHtml(displayHistoryValue(getLendManagementNumber(item)))}</td>
            <td>${escapeHtml(displayHistoryValue(getLendAssetName(item), '備品名未取得'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.borrower_id || item.borrower || ''))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.lent_at || item.created_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(getLendQuantity(item), '1'))}</td>
            <td>${returned ? '返却済み' : '貸出中'}</td>
            <td class="history-action-cell"><button class="sm-btn" onclick="LendReturnController.openLendHistoryDetail(${index})">詳細</button></td>
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
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, index) => renderLendHistoryRow(item, index)).join('')}
            </tbody>
        </table>
    `;
}

function renderReturnHistoryRow(item, index) {
    return `
        <tr>
            <td>${escapeHtml(displayHistoryValue(getLendManagementNumber(item)))}</td>
            <td>${escapeHtml(displayHistoryValue(getLendAssetName(item), '備品名未取得'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.borrower_id || item.borrower || ''))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.lent_at || item.lent_on || item.created_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.returned_at || item.processed_at || ''), '-'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.quantity || getLendQuantity(item), '1'))}</td>
            <td class="history-action-cell"><button class="sm-btn" onclick="LendReturnController.openReturnHistoryDetail(${index})">詳細</button></td>
        </tr>
    `;
}

function renderReturnHistoryTable(items) {
    return `
        <table class="history-record-table">
            <thead>
                <tr>
                    <th>備品番号</th>
                    <th>備品名</th>
                    <th>貸出先</th>
                    <th>貸出日</th>
                    <th>返却日</th>
                    <th>数量</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, index) => renderReturnHistoryRow(item, index)).join('')}
            </tbody>
        </table>
    `;
}

function getApiErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.message || error?.response?.data?.error || fallbackMessage;
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

    hidePageFeedback('return-select-feedback');

    if (!returnState.searchResults || returnState.searchResults.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty-state">候補がありません</td></tr>';
        showPageFeedback('return-select-feedback', '返却候補がありません。再検索してください。', 'warning');
        return;
    }

    tbody.innerHTML = returnState.searchResults.map((item, index) => `
        <tr>
            <td>${escapeHtml(displayHistoryValue(getLendManagementNumber(item)))}</td>
            <td>${escapeHtml(displayHistoryValue(item.asset_name, '備品名未取得'))}</td>
            <td>${escapeHtml(displayHistoryValue(item.serial))}</td>
            <td>${escapeHtml(getLendQuantity(item))}</td>
            <td>${escapeHtml(displayHistoryValue(item.borrower_id || item.borrower || ''))}</td>
            <td>${escapeHtml(displayHistoryValue(formatDate(item.lent_at || item.created_at || ''), '-'))}</td>
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
    syncHistoryQueryInputs('lend', lendState.history);
    syncHistoryFilterPanel('lend', lendState.history);
    updateHistorySummary('lend', lendState.history);

    if (!lendState.history.items || lendState.history.items.length === 0) {
        list.innerHTML = renderHistoryEmptyState(config.emptyTitle, config.emptyDescription);
        if (pagination) {
            pagination.innerHTML = '';
        }
        setHistoryStatus(
            'lend',
            hasActiveHistoryQuery(lendState.history.query)
                ? '絞り込み条件に一致する貸出履歴はありません。'
                : `${getLendHistoryFilterLabel(lendState.history.filter)}の履歴はありません。`,
            'info'
        );
        return;
    }

    list.innerHTML = renderLendHistoryTable(lendState.history.items);
    setHistoryStatus(
        'lend',
        hasActiveHistoryQuery(lendState.history.query)
            ? `絞り込み条件に一致する貸出履歴を ${lendState.history.totalItems}件表示しています。`
            : `${getLendHistoryFilterLabel(lendState.history.filter)}の履歴を ${lendState.history.totalItems}件表示しています。`,
        'success'
    );
    renderHistoryPagination(pagination, lendState.history.totalPages, lendState.history.currentPage, 'lend');
}

function renderReturnHistory() {
    const { list, pagination, config } = getHistoryDom('return');
    if (!list) {
        return;
    }

    syncHistoryPerPageSelect('return', returnState.history);
    syncHistoryQueryInputs('return', returnState.history);
    syncHistoryFilterPanel('return', returnState.history);
    updateHistorySummary('return', returnState.history);

    if (!returnState.history.items || returnState.history.items.length === 0) {
        list.innerHTML = renderHistoryEmptyState(config.emptyTitle, config.emptyDescription);
        if (pagination) {
            pagination.innerHTML = '';
        }
        setHistoryStatus(
            'return',
            hasActiveHistoryQuery(returnState.history.query)
                ? '絞り込み条件に一致する返却履歴はありません。'
                : '表示できる返却履歴はありません。',
            'info'
        );
        return;
    }

    list.innerHTML = renderReturnHistoryTable(returnState.history.items);
    setHistoryStatus(
        'return',
        hasActiveHistoryQuery(returnState.history.query)
            ? `絞り込み条件に一致する返却履歴を ${returnState.history.totalItems}件表示しています。`
            : `${returnState.history.totalItems}件の返却履歴を表示しています。`,
        'success'
    );
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

function restoreNamedFormValues(form, data) {
    if (!form || !data) {
        return;
    }

    Object.keys(data).forEach((key) => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = data[key];
        }
    });
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
                clearActiveFeedback();
                return;
            }

            if (result.cancelled) {
                return;
            }

            showActiveFeedback('NFC読み取り失敗: ' + result.error, 'error');
        } catch (error) {
            console.error('scan error:', error);
            showActiveFeedback(
                'NFC読み取り中にエラーが発生しました: ' + (error instanceof Error ? error.message : String(error)),
                'error'
            );
        }
    },

    async saveLendInput() {
        const form = document.getElementById('form-lend');
        if (!form) {
            return;
        }

        hidePageFeedback('lend-input-feedback');
        clearFeedbackInContainer(form);
        if (!form.reportValidity()) {
            showPageFeedback('lend-input-feedback', '入力内容を確認してください。', 'error');
            return;
        }

        const formData = new FormData(form);
        lendState.data = {};
        for (const pair of formData.entries()) {
            lendState.data[pair[0]] = pair[1];
        }

        try {
            const assetDetails = await fetchRequiredLendAssetDetails(lendState.data.itemId);
            lendState.data.assetName = assetDetails.asset_name;
            lendState.data.serial = assetDetails.serial;
            Router.to('lend-confirm');
        } catch (error) {
            console.error('saveLendInput asset lookup error:', error);
            const itemInput = form.querySelector('input[name="itemId"]');
            if (itemInput) {
                setFieldFeedback(itemInput, getApiErrorMessage(error, '備品情報の取得に失敗しました。'));
            }
            showApiPageFeedback('lend-input-feedback', error, '備品情報の取得に失敗しました。');
        }
    },

    async submitLend() {
        if (isSubmittingLend) {
            return;
        }

        isSubmittingLend = true;
        setControlsDisabled(['#lend-confirm-back-btn'], true);

        try {
            hidePageFeedback('lend-confirm-feedback');
            await runWithButtonLoading('#lend-submit-btn', { busyText: '登録中...' }, async () => {
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
                clearHistorySourceCache('lend');
                clearHistorySourceCache('return');
                await showLendReturnComplete({
                    message: '貸出登録が完了しました',
                    autoRedirectSeconds: 0,
                    actions: [
                        {
                            label: '続けて貸出登録',
                            routeKey: 'lend-input',
                            style: 'primary-btn',
                            clearHistory: true
                        },
                        {
                            label: '貸出メニューへ戻る',
                            routeKey: 'lend-menu',
                            style: 'back-btn',
                            clearHistory: true
                        }
                    ]
                });
            });
        } catch (error) {
            console.error('submitLend error:', error);
            showApiPageFeedback('lend-confirm-feedback', error, '貸出登録に失敗しました。');
        } finally {
            isSubmittingLend = false;
            setControlsDisabled(['#lend-confirm-back-btn'], false);
        }
    },

    async triggerQuickReturn(lendKey) {
        if (!lendKey) {
            setHistoryStatus('lend', '貸出番号が取得できません。', 'error');
            return;
        }

        try {
            const result = await API.lending.getLend(lendKey);
            const [target] = await enrichLendItemsWithAssetDetails([result]);
            returnState.targetLending = target;
            returnState.searchResults = [];
            Router.to('return-input');
        } catch (error) {
            console.error('triggerQuickReturn error:', error);
            setHistoryStatus('lend', getApiErrorMessage(error, '返却対象の取得に失敗しました。'), 'error');
        }
    },

    async searchLending() {
        if (isSearchingLending) {
            return;
        }

        const input = document.getElementById('return-search-query');
        const query = input ? input.value.trim() : '';
        hidePageFeedback('return-search-feedback');
        if (input) {
            clearFieldFeedback(input);
        }

        if (!query) {
            if (input) {
                setFieldFeedback(input, '備品番号または貸出先を入力してください。');
            }
            showPageFeedback('return-search-feedback', '備品番号または貸出先を入力してください。', 'error');
            return;
        }

        isSearchingLending = true;
        setControlsDisabled(['#return-search-query', '#return-search-back-btn'], true);
        try {
            await runWithButtonLoading('#return-search-btn', { busyText: '参照中...' }, async () => {
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
                    showPageFeedback('return-search-feedback', '該当する貸出情報が見つかりません。', 'warning');
                    return;
                }

                if (list.length === 1) {
                    const [target] = await enrichLendItemsWithAssetDetails(list);
                    returnState.targetLending = target;
                    returnState.searchResults = [];
                    Router.to('return-input');
                    return;
                }

                returnState.targetLending = null;
                returnState.searchResults = await enrichLendItemsWithAssetDetails(list);
                Router.to('return-select');
            });
        } catch (error) {
            console.error('searchLending error:', error);
            showApiPageFeedback('return-search-feedback', error, '貸出検索に失敗しました。');
        } finally {
            isSearchingLending = false;
            setControlsDisabled(['#return-search-query', '#return-search-back-btn'], false);
        }
    },

    async selectReturnTarget(index) {
        const target = returnState.searchResults[index];
        if (!target) {
            showPageFeedback('return-select-feedback', '返却候補が見つかりません。再検索してください。', 'error');
            return;
        }

        const [enrichedTarget] = await enrichLendItemsWithAssetDetails([target]);
        returnState.targetLending = enrichedTarget;
        Router.to('return-input');
    },

    backToReturnSearch() {
        returnState.targetLending = null;
        returnState.searchResults = [];
        Router.to('return-search');
    },

    saveReturnInput() {
        const form = document.getElementById('form-return');
        if (!form) {
            return;
        }

        hidePageFeedback('return-input-feedback');
        clearFeedbackInContainer(form);
        if (!form.reportValidity()) {
            showPageFeedback('return-input-feedback', '入力内容を確認してください。', 'error');
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
            showPageFeedback('return-confirm-feedback', '返却対象がありません。', 'error');
            return;
        }

        const lendKey = getLendKey(returnState.targetLending);
        if (!lendKey) {
            showPageFeedback('return-confirm-feedback', '貸出番号が取得できません。', 'error');
            return;
        }

        isSubmittingReturn = true;
        setControlsDisabled(['#return-confirm-back-btn'], true);

        try {
            hidePageFeedback('return-confirm-feedback');
            await runWithButtonLoading('#return-submit-btn', { busyText: '登録中...' }, async () => {
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
                clearHistorySourceCache('lend');
                clearHistorySourceCache('return');

                await showLendReturnComplete({
                    message: '返却処理が完了しました',
                    autoRedirectSeconds: 0,
                    actions: [
                        {
                            label: '続けて返却登録',
                            routeKey: 'return-search',
                            style: 'primary-btn',
                            clearHistory: true
                        },
                        {
                            label: '返却メニューへ戻る',
                            routeKey: 'return-menu',
                            style: 'back-btn',
                            clearHistory: true
                        }
                    ]
                });
            });
        } catch (error) {
            console.error('submitReturn error:', error);
            showApiPageFeedback('return-confirm-feedback', error, '返却処理に失敗しました。');
        } finally {
            isSubmittingReturn = false;
            setControlsDisabled(['#return-confirm-back-btn'], false);
        }
    },

    async changeLendHistoryPerPage(value) {
        if (lendState.history.loading) {
            return;
        }

        lendState.history.itemsPerPage = Number(value);
        lendState.history.currentPage = 1;
        persistLendHistoryState();
        await this.loadLendHistory(1);
    },

    async changeLendHistoryFilter(value) {
        if (lendState.history.loading) {
            return;
        }

        lendState.history.filter = value || 'all';
        clearHistorySourceCache('lend');
        lendState.history.currentPage = 1;
        persistLendHistoryState();
        await this.loadLendHistory(1);
    },

    async changeLendHistoryPage(page) {
        if (lendState.history.loading) {
            return;
        }

        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > lendState.history.totalPages) {
            return;
        }

        lendState.history.currentPage = targetPage;
        persistLendHistoryState();
        await this.loadLendHistory(targetPage);
    },

    async changeReturnHistoryPerPage(value) {
        if (returnState.history.loading) {
            return;
        }

        returnState.history.itemsPerPage = Number(value);
        returnState.history.currentPage = 1;
        persistReturnHistoryState();
        await this.loadReturnHistory(1);
    },

    async changeReturnHistoryPage(page) {
        if (returnState.history.loading) {
            return;
        }

        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > returnState.history.totalPages) {
            return;
        }

        returnState.history.currentPage = targetPage;
        persistReturnHistoryState();
        await this.loadReturnHistory(targetPage);
    },

    openLendHistoryDetail(index) {
        const item = lendState.history.items[index];
        if (!item) {
            setHistoryStatus('lend', '対象の貸出履歴が見つかりません。', 'error');
            return;
        }

        lendState.history.detailItem = item;
        openHistoryDetailModal('lend');
    },

    closeLendHistoryDetail() {
        closeHistoryDetailModal('lend');
    },

    openReturnHistoryDetail(index) {
        const item = returnState.history.items[index];
        if (!item) {
            setHistoryStatus('return', '対象の返却履歴が見つかりません。', 'error');
            return;
        }

        returnState.history.detailItem = item;
        openHistoryDetailModal('return');
    },

    closeReturnHistoryDetail() {
        closeHistoryDetailModal('return');
    },

    async applyLendHistoryFilters() {
        if (lendState.history.loading) {
            return;
        }

        lendState.history.query = readHistoryQueryFromInputs('lend');
        lendState.history.currentPage = 1;
        persistLendHistoryState();
        await this.loadLendHistory(1);
    },

    async clearLendHistoryFilters() {
        if (lendState.history.loading) {
            return;
        }

        lendState.history.query = createHistoryQuery();
        lendState.history.currentPage = 1;
        syncHistoryQueryInputs('lend', lendState.history);
        persistLendHistoryState();
        await this.loadLendHistory(1);
    },

    toggleLendHistoryFilters() {
        if (lendState.history.loading) {
            return;
        }

        toggleHistoryFilterPanel('lend');
    },

    async applyReturnHistoryFilters() {
        if (returnState.history.loading) {
            return;
        }

        returnState.history.query = readHistoryQueryFromInputs('return');
        returnState.history.currentPage = 1;
        persistReturnHistoryState();
        await this.loadReturnHistory(1);
    },

    async clearReturnHistoryFilters() {
        if (returnState.history.loading) {
            return;
        }

        returnState.history.query = createHistoryQuery();
        returnState.history.currentPage = 1;
        syncHistoryQueryInputs('return', returnState.history);
        persistReturnHistoryState();
        await this.loadReturnHistory(1);
    },

    toggleReturnHistoryFilters() {
        if (returnState.history.loading) {
            return;
        }

        toggleHistoryFilterPanel('return');
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
        setHistoryControlsLoading('lend', true);
        if (pagination) {
            pagination.innerHTML = '';
        }

        try {
            if (hasActiveHistoryQuery(lendState.history.query)) {
                const sourceItems = await getLendHistorySourceItems();
                const filteredItems = filterLendHistoryItems(sourceItems);
                const normalized = normalizePageResponse(filteredItems, {
                    page,
                    itemsPerPage: lendState.history.itemsPerPage
                });
                lendState.history.items = normalized.items;
                lendState.history.totalItems = normalized.totalItems;
                lendState.history.totalPages = normalized.totalPages;
                lendState.history.currentPage = Math.min(page, normalized.totalPages);
            } else {
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
                lendState.history.items = await enrichLendItemsWithAssetDetails(lendState.history.items);
            }

            persistLendHistoryState();
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
        } finally {
            setHistoryControlsLoading('lend', false);
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
        setHistoryControlsLoading('return', true);
        if (pagination) {
            pagination.innerHTML = '';
        }

        try {
            if (hasActiveHistoryQuery(returnState.history.query)) {
                const sourceItems = await getReturnHistorySourceItems();
                const filteredItems = filterReturnHistoryItems(sourceItems);
                const normalized = normalizePageResponse(filteredItems, {
                    page,
                    itemsPerPage: returnState.history.itemsPerPage
                });
                returnState.history.items = normalized.items;
                returnState.history.totalItems = normalized.totalItems;
                returnState.history.totalPages = normalized.totalPages;
                returnState.history.currentPage = Math.min(page, normalized.totalPages);
            } else {
                const response = await API.lending.fetchReturns({
                    limit: returnState.history.itemsPerPage,
                    offset: (page - 1) * returnState.history.itemsPerPage
                });

                assignHistoryPage(returnState.history, response, page);
                returnState.history.items = await enrichReturnHistoryItems(returnState.history.items);
            }

            persistReturnHistoryState();
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
        } finally {
            setHistoryControlsLoading('return', false);
        }
    },
};

export function initLendReturn(view) {
    if (view === 'lend-confirm') {
        hidePageFeedback('lend-confirm-feedback');
        const display = document.getElementById('lend-confirm-view');
        if (display) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${escapeHtml(lendState.data.itemId || '')}</span></div>
                <div class="info-row"><span class="info-label">備品名</span><span>${escapeHtml(displayHistoryValue(lendState.data.assetName, '備品名未取得'))}</span></div>
                <div class="info-row"><span class="info-label">シリアル番号</span><span>${escapeHtml(displayHistoryValue(lendState.data.serial))}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${escapeHtml(lendState.data.qty || '')}</span></div>
                <div class="info-row"><span class="info-label">貸出先</span><span>${escapeHtml(lendState.data.borrower || '')}</span></div>
                <div class="info-row"><span class="info-label">返却予定</span><span>${escapeHtml(lendState.data.dueDate || '')}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${escapeHtml(lendState.data.lender || '')}</span></div>
            `;
        }
    } else if (view === 'return-search') {
        hidePageFeedback('return-search-feedback');
    } else if (view === 'return-select') {
        hidePageFeedback('return-select-feedback');
        renderReturnSelection();
    } else if (view === 'lend-input') {
        hidePageFeedback('lend-input-feedback');
        const form = document.getElementById('form-lend');
        if (form) {
            restoreNamedFormValues(form, lendState.data);
        }
        mountDeviceStatusPanel('lend-device-status', {
            title: '利用機器',
            devices: ['nfc']
        });
        mountAssetPreview('input[name="itemId"]', 'lend-asset-preview', {
            emptyMessage: '備品番号を入力すると、貸出前に対象備品を確認できます。'
        });
    } else if (view === 'return-input') {
        hidePageFeedback('return-input-feedback');
        mountDeviceStatusPanel('return-device-status', {
            title: '利用機器',
            devices: ['nfc']
        });
        const form = document.getElementById('form-return');
        const target = returnState.targetLending;
        if (!target) {
            Router.to('return-search').then(() => {
                showPageFeedback('return-search-feedback', '返却対象が見つかりません。対象を再検索してください。', 'warning');
            });
            return;
        }

        const lendingIdInput = document.getElementById('disp-lending-id');
        const managementNumberInput = document.getElementById('disp-management-number');
        const assetNameInput = document.getElementById('disp-asset-name');
        const serialInput = document.getElementById('disp-serial');
        const qtyInput = document.getElementById('disp-qty');
        const borrowerInput = document.getElementById('disp-borrower');
        const dateInput = document.querySelector('input[name="returnDate"]');

        if (lendingIdInput) {
            lendingIdInput.value = getLendKey(target);
        }
        if (managementNumberInput) {
            managementNumberInput.value = displayHistoryValue(getLendManagementNumber(target));
        }
        if (assetNameInput) {
            assetNameInput.value = displayHistoryValue(target.asset_name, '備品名未取得');
        }
        if (serialInput) {
            serialInput.value = displayHistoryValue(target.serial);
        }
        if (qtyInput) {
            qtyInput.value = getLendQuantity(target);
        }
        if (borrowerInput) {
            borrowerInput.value = target.borrower_id || target.borrower || '';
        }
        if (dateInput) {
            dateInput.value = returnState.inputData.returnDate || toDateInputValue(new Date());
        }
        const returnerInput = form.querySelector('input[name="returner"]');
        if (returnerInput) {
            returnerInput.value = returnState.inputData.returner || '';
        }
    } else if (view === 'return-confirm') {
        hidePageFeedback('return-confirm-feedback');
        const display = document.getElementById('return-confirm-view');
        const target = returnState.targetLending;
        const input = returnState.inputData;

        if (display && target) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">貸出番号</span><span class="inline-key">${escapeHtml(getLendKey(target))}</span></div>
                <div class="info-row"><span class="info-label">備品番号</span><span>${escapeHtml(displayHistoryValue(getLendManagementNumber(target)))}</span></div>
                <div class="info-row"><span class="info-label">備品名</span><span>${escapeHtml(displayHistoryValue(target.asset_name, '備品名未取得'))}</span></div>
                <div class="info-row"><span class="info-label">シリアル番号</span><span>${escapeHtml(displayHistoryValue(target.serial))}</span></div>
                <div class="info-row"><span class="info-label">返却日</span><span>${escapeHtml(input.returnDate || '')}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${escapeHtml(input.returner || '')}</span></div>
            `;
        }
    }

    if (view === 'lend-history') {
        restoreLendHistoryState();
        historyFilterUiState.lend = false;
        syncHistoryQueryInputs('lend', lendState.history);
        syncHistoryFilterPanel('lend', lendState.history);
        closeHistoryDetailModal('lend');
        window.LendReturnController.loadLendHistory(lendState.history.currentPage);
    } else if (view === 'return-history') {
        restoreReturnHistoryState();
        historyFilterUiState.return = false;
        syncHistoryQueryInputs('return', returnState.history);
        syncHistoryFilterPanel('return', returnState.history);
        closeHistoryDetailModal('return');
        window.LendReturnController.loadReturnHistory(returnState.history.currentPage);
    }
}
