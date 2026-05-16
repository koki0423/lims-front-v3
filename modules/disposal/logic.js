import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { escapeHtml, toDateInputValue } from '../../js/dom_utils.js';
import { normalizePageResponse } from '../../js/pagination_utils.js';

// 廃棄機能の状態管理
const disposalState = {
    data: {},
    submitting: false,
};

const historyState = {
    items: [],
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
    totalItems: 0
};

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
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

function renderDisposalHistoryRow(item) {
    return `
        <tr>
            <td>${escapeHtml(displayDisposalValue(formatDisposalDate(item.disposed_at), '-'))}</td>
            <td>${escapeHtml(displayDisposalValue(item.management_number))}</td>
            <td>${escapeHtml(displayDisposalValue(item.quantity))}</td>
            <td>${escapeHtml(displayDisposalValue(item.reason, '－'))}</td>
            <td>${escapeHtml(displayDisposalValue(item.processed_by_id, '不明'))}</td>
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
                </tr>
            </thead>
            <tbody>
                ${items.map(renderDisposalHistoryRow).join('')}
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
    if (pagination) {
        pagination.innerHTML = '';
    }

    try {
        const response = await API.disposal.fetchHistory({
            limit: historyState.itemsPerPage,
            offset: (safePage - 1) * historyState.itemsPerPage
        });

        const normalized = normalizePageResponse(response, {
            page: safePage,
            itemsPerPage: historyState.itemsPerPage
        });

        historyState.items = normalized.items;
        historyState.currentPage = Math.min(safePage, normalized.totalPages);
        historyState.totalItems = normalized.totalItems;
        historyState.totalPages = normalized.totalPages;

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
                return;
            }

            if (result.cancelled) {
                return;
            }

            input.value = "error";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (err) {
            console.error("scan error:", err);
            input.value = "error";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    },

    async toConfirm() {
        const form = document.getElementById('form-disposal');
        if (!form || !form.reportValidity()) return;

        const formData = new FormData(form);
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

        Router.to('disposal-confirm');
    },

    async disposalSubmit() {
        if (disposalState.submitting) return;

        const data = disposalState.data;
        const mgmt = normalizeMgmtInput(data.itemId);
        if (!mgmt) {
            alert('管理番号が不正です');
            return;
        }

        const payload = {
            reason: data.reason,
            processed_by_id: data.registrant,
            quantity: parseInt(data.qty, 10),
        };

        disposalState.submitting = true;
        try {
            await API.disposal.register(mgmt, payload);
            disposalState.data = {};

            if (typeof CommonController !== 'undefined' && CommonController.showComplete) {
                CommonController.showComplete('廃棄登録が完了しました');
            } else {
                alert('廃棄登録が完了しました');
                Router.to('disposal-input');
            }
        } catch (error) {
            console.error('Disposal Submit error:', error);
            const message = error?.response?.data?.error || '廃棄登録中にエラーが発生しました。';
            alert(message);
        } finally {
            disposalState.submitting = false;
        }
    },

    async changePerPage(val) {
        historyState.itemsPerPage = Number(val);
        await loadDisposalHistoryPage(1);
    },

    async changePage(page) {
        const targetPage = Number(page);
        if (targetPage < 1 || targetPage > historyState.totalPages) {
            return;
        }

        await loadDisposalHistoryPage(targetPage);
    }
};

export function initDisposal(view) {
    if (view === 'input') {
        const form = document.getElementById('form-disposal');
        if (!form) return;

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
    } else if (view === 'confirm') {
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
    const list = document.getElementById('disposal-history-list');
    if (list) {
        list.innerHTML = '';
    }

    await loadDisposalHistoryPage(1);
}

function renderTable() {
    const list = document.getElementById('disposal-history-list');
    const paginationDiv = document.getElementById('disposal-history-pagination');
    if (!list) return;

    syncDisposalHistoryPerPage();
    updateDisposalHistorySummary();

    if (historyState.items.length === 0) {
        list.innerHTML = renderDisposalEmptyState('廃棄履歴はありません', '表示条件に一致する廃棄記録はありません。');
        if (paginationDiv) {
            paginationDiv.innerHTML = '';
        }
        setDisposalHistoryStatus('表示できる廃棄履歴はありません。', 'info');
        return;
    }

    list.innerHTML = renderDisposalHistoryTable(historyState.items);
    setDisposalHistoryStatus(`${historyState.totalItems}件の廃棄履歴を表示しています。`, 'success');

    renderDisposalPagination();
}
