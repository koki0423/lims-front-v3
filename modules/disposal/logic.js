import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { escapeHtml, toDateInputValue } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';
import { mountAssetPreview } from '../../js/asset_preview.js';
import { mountDeviceStatusPanel } from '../../js/device_status.js';
import { runWithButtonLoading, setControlsDisabled } from '../../js/ui_loading.js';
import { clearFeedbackInContainer, clearFieldFeedback, hidePageFeedback, setFieldFeedback, showApiPageFeedback, showPageFeedback } from '../../js/ui_feedback.js';
import { loadViewState, saveViewState } from '../../js/view_state.js';

// 廃棄機能の状態管理
const disposalState = {
    data: {},
    submitting: false,
};

const historyState = {
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
        operator: '',
        dateFrom: '',
        dateTo: ''
    }
};

const DISPOSAL_HISTORY_VIEW_STATE_KEY = 'disposal-history-view';
const disposalAssetDetailsCache = new Map();
const disposalAssetDetailsRequestCache = new Map();
let activeDisposalHistoryDetailContext = null;
let isDisposalHistoryFilterExpanded = false;

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
}

function createDisposalHistoryQuery(overrides = {}) {
    return {
        managementNumber: '',
        assetName: '',
        operator: '',
        dateFrom: '',
        dateTo: '',
        ...overrides
    };
}

function restoreDisposalHistoryState() {
    const persisted = loadViewState(DISPOSAL_HISTORY_VIEW_STATE_KEY, {});
    historyState.currentPage = Math.max(1, Number(persisted.currentPage) || 1);

    const itemsPerPage = Number(persisted.itemsPerPage);
    if ([10, 20, 50].includes(itemsPerPage)) {
        historyState.itemsPerPage = itemsPerPage;
    }
    historyState.query = createDisposalHistoryQuery(persisted.query);
}

function persistDisposalHistoryState() {
    saveViewState(DISPOSAL_HISTORY_VIEW_STATE_KEY, {
        currentPage: historyState.currentPage,
        itemsPerPage: historyState.itemsPerPage,
        query: historyState.query
    });
}

function setDisposalHistoryLoading(isLoading) {
    historyState.loading = isLoading;
    setControlsDisabled([
        '#disposal-history-query-toggle-btn',
        '#disposal-history-per-page',
        '#disposal-history-pagination .page-btn',
        '#disposal-history-query-form input',
        '#disposal-history-apply-btn',
        '#disposal-history-clear-btn',
        '#disposal-history-list .sm-btn'
    ], isLoading);
}

function displayDisposalValue(value, fallback = '-') {
    if (value === null || value === undefined) {
        return fallback;
    }

    const text = String(value).trim();
    return text === '' ? fallback : text;
}

function formatDisposalDate(value) {
    const dateObj = new Date(value);
    if (Number.isNaN(dateObj.getTime())) {
        return '-';
    }

    return `${dateObj.toLocaleDateString('ja-JP')} ${dateObj.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    })}`;
}

function normalizeDisposalFilterText(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

function includesDisposalFilterText(value, query) {
    const safeQuery = normalizeDisposalFilterText(query);
    if (!safeQuery) {
        return true;
    }

    return normalizeDisposalFilterText(value).includes(safeQuery);
}

function toDisposalDateOnlyValue(value) {
    const safeValue = displayDisposalValue(value, '');
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

function matchesDisposalDateRange(value, dateFrom, dateTo) {
    const dateValue = toDisposalDateOnlyValue(value);
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

function hasActiveDisposalHistoryQuery() {
    return Boolean(
        historyState.query.managementNumber
        || historyState.query.assetName
        || historyState.query.operator
        || historyState.query.dateFrom
        || historyState.query.dateTo
    );
}

function clearDisposalHistorySourceCache() {
    historyState.sourceItems = null;
    historyState.sourceCacheKey = '';
}

async function fetchDisposalAssetDetails(managementNumber) {
    const key = String(managementNumber || '').trim();
    if (!key) {
        return { asset_name: '', serial: '' };
    }

    if (disposalAssetDetailsCache.has(key)) {
        return disposalAssetDetailsCache.get(key);
    }

    if (disposalAssetDetailsRequestCache.has(key)) {
        return disposalAssetDetailsRequestCache.get(key);
    }

    const request = API.assets.getPair(key)
        .then((response) => {
            const details = {
                asset_name: String(response?.master?.name || response?.asset?.name || '').trim(),
                serial: String(response?.asset?.serial || '').trim()
            };
            disposalAssetDetailsCache.set(key, details);
            return details;
        })
        .catch((error) => {
            console.warn('fetchDisposalAssetDetails error:', key, error);
            return { asset_name: '', serial: '' };
        })
        .finally(() => {
            disposalAssetDetailsRequestCache.delete(key);
        });

    disposalAssetDetailsRequestCache.set(key, request);
    return request;
}

async function enrichDisposalHistoryItems(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const uniqueManagementNumbers = Array.from(
        new Set(
            safeItems
                .map((item) => String(item.management_number || '').trim())
                .filter((value) => value !== '')
        )
    );

    await Promise.all(uniqueManagementNumbers.map(fetchDisposalAssetDetails));

    return safeItems.map((item) => {
        const managementNumber = String(item.management_number || '').trim();
        const details = managementNumber ? disposalAssetDetailsCache.get(managementNumber) : null;
        return {
            ...item,
            asset_name: String(item.asset_name || details?.asset_name || '').trim(),
            serial: String(item.serial || details?.serial || '').trim()
        };
    });
}

async function fetchAllDisposalHistoryItems() {
    if (Array.isArray(historyState.sourceItems) && historyState.sourceCacheKey === 'all') {
        return historyState.sourceItems;
    }

    const allItems = [];
    let offset = 0;
    let pageGuard = 0;

    while (pageGuard < 100) {
        const response = await API.disposal.fetchHistory({
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

    historyState.sourceItems = await enrichDisposalHistoryItems(allItems);
    historyState.sourceCacheKey = 'all';
    return historyState.sourceItems;
}

function syncDisposalHistoryQueryInputs() {
    const managementNumber = document.getElementById('disposal-history-query-mgmt');
    const assetName = document.getElementById('disposal-history-query-name');
    const operator = document.getElementById('disposal-history-query-operator');
    const dateFrom = document.getElementById('disposal-history-date-from');
    const dateTo = document.getElementById('disposal-history-date-to');

    if (managementNumber) {
        managementNumber.value = historyState.query.managementNumber || '';
    }
    if (assetName) {
        assetName.value = historyState.query.assetName || '';
    }
    if (operator) {
        operator.value = historyState.query.operator || '';
    }
    if (dateFrom) {
        dateFrom.value = historyState.query.dateFrom || '';
    }
    if (dateTo) {
        dateTo.value = historyState.query.dateTo || '';
    }
}

function syncDisposalHistoryFilterPanel() {
    const form = document.getElementById('disposal-history-query-form');
    const toggle = document.getElementById('disposal-history-query-toggle-btn');
    if (!form || !toggle) {
        return;
    }

    form.hidden = !isDisposalHistoryFilterExpanded;
    toggle.setAttribute('aria-expanded', isDisposalHistoryFilterExpanded ? 'true' : 'false');
    toggle.textContent = `${isDisposalHistoryFilterExpanded ? '絞り込み条件を閉じる' : '絞り込み条件を開く'}${hasActiveDisposalHistoryQuery() ? '（適用中）' : ''}`;
}

function setDisposalHistoryFilterExpanded(isExpanded) {
    isDisposalHistoryFilterExpanded = isExpanded;
    syncDisposalHistoryFilterPanel();
}

function readDisposalHistoryQueryFromInputs() {
    return createDisposalHistoryQuery({
        managementNumber: document.getElementById('disposal-history-query-mgmt')?.value.trim() || '',
        assetName: document.getElementById('disposal-history-query-name')?.value.trim() || '',
        operator: document.getElementById('disposal-history-query-operator')?.value.trim() || '',
        dateFrom: document.getElementById('disposal-history-date-from')?.value || '',
        dateTo: document.getElementById('disposal-history-date-to')?.value || ''
    });
}

function filterDisposalHistoryItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => {
        if (!includesDisposalFilterText(item.management_number, historyState.query.managementNumber)) {
            return false;
        }
        if (!includesDisposalFilterText(item.asset_name, historyState.query.assetName)) {
            return false;
        }
        if (!includesDisposalFilterText(item.processed_by_id, historyState.query.operator)) {
            return false;
        }

        return matchesDisposalDateRange(item.disposed_at, historyState.query.dateFrom, historyState.query.dateTo);
    });
}

function renderDisposalHistoryDetailContent(item) {
    return `
        <div class="history-detail-grid">
            <div class="history-field">
                <span class="history-field-label">備品番号</span>
                <strong>${escapeHtml(displayDisposalValue(item.management_number))}</strong>
            </div>
            <div class="history-field">
                <span class="history-field-label">備品名</span>
                <strong>${escapeHtml(displayDisposalValue(item.asset_name, '備品名未取得'))}</strong>
            </div>
            <div class="history-field">
                <span class="history-field-label">シリアル番号</span>
                <strong>${escapeHtml(displayDisposalValue(item.serial))}</strong>
            </div>
            <div class="history-field">
                <span class="history-field-label">数量</span>
                <strong>${escapeHtml(displayDisposalValue(item.quantity))}</strong>
            </div>
            <div class="history-field">
                <span class="history-field-label">廃棄日時</span>
                <strong>${escapeHtml(displayDisposalValue(formatDisposalDate(item.disposed_at), '-'))}</strong>
            </div>
            <div class="history-field">
                <span class="history-field-label">担当者</span>
                <strong>${escapeHtml(displayDisposalValue(item.processed_by_id, '不明'))}</strong>
            </div>
        </div>
        <div class="history-detail-note">${escapeHtml(displayDisposalValue(item.reason, '－'))}</div>
    `;
}

function openDisposalHistoryDetailModal() {
    const modal = document.getElementById('disposal-history-detail-modal');
    const content = document.getElementById('disposal-history-detail-content');
    const closeButton = document.getElementById('disposal-history-detail-close-btn');
    if (!modal || !content || !historyState.detailItem) {
        return;
    }

    content.innerHTML = renderDisposalHistoryDetailContent(historyState.detailItem);
    activeDisposalHistoryDetailContext = {
        returnFocusTo: document.activeElement instanceof Element ? document.activeElement : null
    };
    modal.hidden = false;
    document.body.classList.add('dialog-open');
    closeButton?.focus();
}

function closeDisposalHistoryDetailModal() {
    const modal = document.getElementById('disposal-history-detail-modal');
    if (!modal) {
        return;
    }

    modal.hidden = true;
    historyState.detailItem = null;
    document.body.classList.remove('dialog-open');
    if (activeDisposalHistoryDetailContext?.returnFocusTo instanceof Element) {
        activeDisposalHistoryDetailContext.returnFocusTo.focus();
    }
    activeDisposalHistoryDetailContext = null;
}

function syncDisposalHistoryPerPage() {
    const perPage = document.getElementById('disposal-history-per-page');
    if (perPage) {
        perPage.value = String(historyState.itemsPerPage);
    }
}

function updateDisposalHistorySummary() {
    const total = document.getElementById('disposal-history-total');
    const page = document.getElementById('disposal-history-page');
    const range = document.getElementById('disposal-history-range');

    if (total) {
        total.textContent = `${historyState.totalItems}`;
    }

    if (page) {
        page.textContent = `${historyState.currentPage} / ${Math.max(historyState.totalPages, 1)}`;
    }

    if (range) {
        if (historyState.totalItems === 0) {
            range.textContent = '0 - 0';
            return;
        }

        const start = (historyState.currentPage - 1) * historyState.itemsPerPage + 1;
        const end = Math.min(historyState.currentPage * historyState.itemsPerPage, historyState.totalItems);
        range.textContent = `${start} - ${end}`;
    }
}

function setDisposalHistoryStatus(message, type = 'info') {
    const status = document.getElementById('disposal-history-status');
    if (!status) {
        return;
    }

    status.className = `batch-status-banner ${type}`;
    status.textContent = message;
}

function renderDisposalHistoryLoadingState() {
    return `
        <div class="history-loading-grid">
            <div class="history-loading-card"></div>
            <div class="history-loading-card"></div>
            <div class="history-loading-card"></div>
        </div>
    `;
}

function renderDisposalEmptyState(title, description) {
    return `
        <div class="history-empty-state">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(description)}</p>
        </div>
    `;
}

function renderDisposalHistoryRow(item, index) {
    return `
        <tr>
            <td>${escapeHtml(displayDisposalValue(formatDisposalDate(item.disposed_at), '-'))}</td>
            <td>${escapeHtml(displayDisposalValue(item.management_number))}</td>
            <td>${escapeHtml(displayDisposalValue(item.quantity))}</td>
            <td>${escapeHtml(displayDisposalValue(item.reason, '－'))}</td>
            <td>${escapeHtml(displayDisposalValue(item.processed_by_id, '不明'))}</td>
            <td class="history-action-cell"><button class="sm-btn" onclick="DisposalController.openHistoryDetail(${index})">詳細</button></td>
        </tr>
    `;
}

function renderDisposalHistoryTable(items) {
    return `
        <table class="history-record-table">
            <thead>
                <tr>
                    <th>廃棄日時</th>
                    <th>管理番号</th>
                    <th>数量</th>
                    <th>廃棄理由</th>
                    <th>担当者</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, index) => renderDisposalHistoryRow(item, index)).join('')}
            </tbody>
        </table>
    `;
}

function renderDisposalPagination() {
    const paginationDiv = document.getElementById('disposal-history-pagination');
    if (!paginationDiv) {
        return;
    }

    if (historyState.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    const current = historyState.currentPage;
    const totalPages = historyState.totalPages;
    const sequence = [];

    for (let i = 1; i <= totalPages; i += 1) {
        const shouldShow = totalPages <= 7 || i === 1 || i === totalPages || Math.abs(current - i) <= 1;
        if (shouldShow) {
            sequence.push(i);
            continue;
        }

        if (sequence[sequence.length - 1] !== 'ellipsis') {
            sequence.push('ellipsis');
        }
    }

    let html = `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="DisposalController.changePage(${current - 1})">＜</button>`;

    for (let i = 0; i < sequence.length; i += 1) {
        if (sequence[i] === 'ellipsis') {
            html += '<span class="history-pagination-ellipsis">...</span>';
            continue;
        }

        const pageNumber = sequence[i];
        const activeClass = pageNumber === current ? 'active' : '';
        html += `<button class="page-btn ${activeClass}" onclick="DisposalController.changePage(${pageNumber})">${pageNumber}</button>`;
    }

    html += `<button class="page-btn" ${current === totalPages ? 'disabled' : ''} onclick="DisposalController.changePage(${current + 1})">＞</button>`;
    paginationDiv.innerHTML = html;
}

// 管理番号の正規化
function normalizeMgmtInput(s) {
    if (!s) return '';
    let t = String(s).normalize('NFKC').trim();
    t = t.replace(/[‐-‒–—―ー−]/g, '-');
    return t.toUpperCase();
}

async function loadDisposalHistoryPage(page = 1) {
    const list = document.getElementById('disposal-history-list');
    const pagination = document.getElementById('disposal-history-pagination');
    const safePage = Math.max(1, Number(page) || 1);

    if (!list) {
        return;
    }

    syncDisposalHistoryPerPage();
    setDisposalHistoryStatus('廃棄履歴を読み込んでいます。', 'info');
    list.innerHTML = renderDisposalHistoryLoadingState();
    historyState.currentPage = safePage;
    updateDisposalHistorySummary();
    setDisposalHistoryLoading(true);
    if (pagination) {
        pagination.innerHTML = '';
    }

    try {
        if (hasActiveDisposalHistoryQuery()) {
            const sourceItems = await fetchAllDisposalHistoryItems();
            const filteredItems = filterDisposalHistoryItems(sourceItems);
            const normalized = normalizePageResponse(filteredItems, {
                page: safePage,
                itemsPerPage: historyState.itemsPerPage
            });

            historyState.items = normalized.items;
            historyState.currentPage = Math.min(safePage, normalized.totalPages);
            historyState.totalItems = normalized.totalItems;
            historyState.totalPages = normalized.totalPages;
        } else {
            const response = await API.disposal.fetchHistory({
                limit: historyState.itemsPerPage,
                offset: (safePage - 1) * historyState.itemsPerPage
            });

            const normalized = normalizePageResponse(response, {
                page: safePage,
                itemsPerPage: historyState.itemsPerPage
            });

            historyState.items = await enrichDisposalHistoryItems(normalized.items);
            historyState.currentPage = Math.min(safePage, normalized.totalPages);
            historyState.totalItems = normalized.totalItems;
            historyState.totalPages = normalized.totalPages;
        }
        persistDisposalHistoryState();

        renderTable();
    } catch (error) {
        console.error('Fetch error:', error);
        historyState.items = [];
        historyState.currentPage = 1;
        historyState.totalPages = 1;
        historyState.totalItems = 0;
        if (list) {
            list.innerHTML = renderDisposalEmptyState('廃棄履歴を読み込めませんでした', '時間をおいて再度お試しください。');
        }
        if (pagination) {
            pagination.innerHTML = '';
        }
        updateDisposalHistorySummary();
        setDisposalHistoryStatus('廃棄履歴の読み込みに失敗しました。', 'error');
    } finally {
        setDisposalHistoryLoading(false);
    }
}

window.DisposalController = {
    saveInput() {
        const form = document.getElementById('form-disposal');
        if (!form) return;
        const formData = new FormData(form);
        for (const pair of formData.entries()) {
            disposalState.data[pair[0]] = pair[1];
        }
    },

    async NfcRead(targetName) {
        const input = document.querySelector('input[name="' + targetName + '"]');

        if (!input) {
            console.error("target input not found:", targetName);
            return;
        }

        try {
            const { scanStudentIdWithRetry } = await loadNfcReader();
            const result = await scanStudentIdWithRetry(9, 2000);

            if (result.ok) {
                input.value = result.studentId;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                clearFieldFeedback(input);
                hidePageFeedback('disposal-feedback');
                return;
            }

            if (result.cancelled) {
                return;
            }

            input.value = "";
            showPageFeedback('disposal-feedback', 'NFC読み取り失敗: ' + result.error, 'error');
        } catch (err) {
            console.error("scan error:", err);
            input.value = "";
            showPageFeedback(
                'disposal-feedback',
                'NFC読み取り中にエラーが発生しました: ' + (err instanceof Error ? err.message : String(err)),
                'error'
            );
        }
    },

    async toConfirm() {
        const form = document.getElementById('form-disposal');
        if (!form) return;

        hidePageFeedback('disposal-feedback');
        clearFeedbackInContainer(form);
        if (!form.reportValidity()) {
            showPageFeedback('disposal-feedback', '入力内容を確認してください。', 'error');
            return;
        }

        const formData = new FormData(form);
        const rawMgmt = formData.get('itemId') || '';
        const mgmt = normalizeMgmtInput(rawMgmt);

        if (!mgmt) {
            const itemInput = form.querySelector('input[name="itemId"]');
            if (itemInput) {
                setFieldFeedback(itemInput, '備品番号を入力してください。');
            }
            showPageFeedback('disposal-feedback', '備品番号を入力してください。', 'error');
            return;
        }

        disposalState.data.itemId = mgmt;
        disposalState.data.qty = formData.get('qty') || '1';
        disposalState.data.registrant = formData.get('registrant') || '';
        disposalState.data.date = formData.get('date') || '';
        disposalState.data.reason = formData.get('reason') || '';

        if (!disposalState.data.registrant) {
            const registrantInput = form.querySelector('input[name="registrant"]');
            if (registrantInput) {
                setFieldFeedback(registrantInput, '登録者(学生証)を入力してください。');
            }
            showPageFeedback('disposal-feedback', '登録者(学生証)を入力してください。', 'error');
            return;
        }

        Router.to('disposal-confirm');
    },

    async disposalSubmit() {
        if (disposalState.submitting) return;

        const data = disposalState.data;
        const mgmt = normalizeMgmtInput(data.itemId);
        if (!mgmt) {
            showPageFeedback('disposal-confirm-feedback', '管理番号が不正です。', 'error');
            return;
        }

        const payload = {
            reason: data.reason,
            processed_by_id: data.registrant,
            quantity: parseInt(data.qty, 10),
        };

        disposalState.submitting = true;
        setControlsDisabled(['#disposal-confirm-back-btn'], true);
        try {
            await runWithButtonLoading('#disposal-submit-btn', { busyText: '登録中...' }, async () => {
                await API.disposal.register(mgmt, payload);
                disposalState.data = {};
                clearDisposalHistorySourceCache();

                if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                    CommonController.showComplete({
                        message: '廃棄登録が完了しました',
                        autoRedirectSeconds: 0,
                        actions: [
                            {
                                label: '続けて廃棄登録',
                                routeKey: 'disposal-input',
                                style: 'primary-btn',
                                clearHistory: true
                            },
                            {
                                label: '廃棄メニューへ戻る',
                                routeKey: 'disposal-top',
                                style: 'back-btn',
                                clearHistory: true
                            }
                        ]
                    });
                } else {
                    Router.to('disposal-input');
                }
            });
        } catch (error) {
            console.error('Disposal Submit error:', error);
            showApiPageFeedback('disposal-confirm-feedback', error, '廃棄登録中にエラーが発生しました。');
        } finally {
            disposalState.submitting = false;
            setControlsDisabled(['#disposal-confirm-back-btn'], false);
        }
    },

    async changePerPage(val) {
        if (historyState.loading) {
            return;
        }

        historyState.itemsPerPage = Number(val);
        historyState.currentPage = 1;
        persistDisposalHistoryState();
        await loadDisposalHistoryPage(1);
    },

    async changePage(page) {
        if (historyState.loading) {
            return;
        }

        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > historyState.totalPages) {
            return;
        }

        historyState.currentPage = targetPage;
        persistDisposalHistoryState();
        await loadDisposalHistoryPage(targetPage);
    },

    openHistoryDetail(index) {
        const item = historyState.items[index];
        if (!item) {
            setDisposalHistoryStatus('対象の廃棄履歴が見つかりません。', 'error');
            return;
        }

        historyState.detailItem = item;
        openDisposalHistoryDetailModal();
    },

    closeHistoryDetail() {
        closeDisposalHistoryDetailModal();
    },

    async applyHistoryFilters() {
        if (historyState.loading) {
            return;
        }

        historyState.query = readDisposalHistoryQueryFromInputs();
        historyState.currentPage = 1;
        persistDisposalHistoryState();
        await loadDisposalHistoryPage(1);
    },

    async clearHistoryFilters() {
        if (historyState.loading) {
            return;
        }

        historyState.query = createDisposalHistoryQuery();
        historyState.currentPage = 1;
        syncDisposalHistoryQueryInputs();
        persistDisposalHistoryState();
        await loadDisposalHistoryPage(1);
    },

    toggleHistoryFilters() {
        if (historyState.loading) {
            return;
        }

        setDisposalHistoryFilterExpanded(!isDisposalHistoryFilterExpanded);
    }
};

export function initDisposal(view) {
    if (view === 'input') {
        const form = document.getElementById('form-disposal');
        if (!form) return;

        hidePageFeedback('disposal-feedback');

        if (Object.keys(disposalState.data).length > 0) {
            restoreFormData(form, disposalState.data);
        } else {
            const dateInput = form.querySelector('input[name="date"]');
            if (dateInput) {
                const today = toDateInputValue(new Date());
                dateInput.value = today;
                disposalState.data.date = today;
            }
        }

        mountDeviceStatusPanel('disposal-device-status', {
            title: '利用機器',
            devices: ['nfc']
        });
        mountAssetPreview('input[name="itemId"]', 'disposal-asset-preview', {
            emptyMessage: '備品番号を入力すると、廃棄前に対象備品を確認できます。'
        });
    } else if (view === 'confirm') {
        hidePageFeedback('disposal-confirm-feedback');
        const display = document.getElementById('disp-confirm-view');
        if (!display) return;

        const data = disposalState.data;
        display.innerHTML = `
            <div class="info-row"><span class="info-label">備品番号</span><span>${escapeHtml(data.itemId || '')}</span></div>
            <div class="info-row"><span class="info-label">数量</span><span>${escapeHtml(data.qty || '1')}</span></div>
            <div class="info-row"><span class="info-label">登録者</span><span>${escapeHtml(data.registrant || '')}</span></div>
            <div class="info-row"><span class="info-label">廃棄日</span><span>${escapeHtml(data.date || '')}</span></div>
            <div class="info-row"><span class="info-label">廃棄理由</span><span>${escapeHtml(data.reason || '')}</span></div>
        `;
    } else if (view === 'history') {
        initDisposalHistory();
    }
}

function restoreFormData(form, data) {
    Object.keys(data).forEach((key) => {
        const input = form.querySelector('[name="' + key + '"]');
        if (input) {
            input.value = data[key];
        }
    });
}

export async function initDisposalHistory() {
    restoreDisposalHistoryState();
    isDisposalHistoryFilterExpanded = false;
    syncDisposalHistoryQueryInputs();
    syncDisposalHistoryFilterPanel();
    closeDisposalHistoryDetailModal();
    const list = document.getElementById('disposal-history-list');
    if (list) {
        list.innerHTML = '';
    }

    await loadDisposalHistoryPage(historyState.currentPage);
}

function renderTable() {
    const list = document.getElementById('disposal-history-list');
    const paginationDiv = document.getElementById('disposal-history-pagination');
    if (!list) return;

    syncDisposalHistoryPerPage();
    syncDisposalHistoryQueryInputs();
    syncDisposalHistoryFilterPanel();
    updateDisposalHistorySummary();

    if (historyState.items.length === 0) {
        list.innerHTML = renderDisposalEmptyState('廃棄履歴はありません', '表示条件に一致する廃棄記録はありません。');
        if (paginationDiv) {
            paginationDiv.innerHTML = '';
        }
        setDisposalHistoryStatus(
            hasActiveDisposalHistoryQuery()
                ? '絞り込み条件に一致する廃棄履歴はありません。'
                : '表示できる廃棄履歴はありません。',
            'info'
        );
        return;
    }

    list.innerHTML = renderDisposalHistoryTable(historyState.items);
    setDisposalHistoryStatus(
        hasActiveDisposalHistoryQuery()
            ? `絞り込み条件に一致する廃棄履歴を ${historyState.totalItems}件表示しています。`
            : `${historyState.totalItems}件の廃棄履歴を表示しています。`,
        'success'
    );

    renderDisposalPagination();
}
