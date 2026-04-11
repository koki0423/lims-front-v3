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

// 管理番号の正規化
function normalizeMgmtInput(s) {
    if (!s) return '';
    let t = String(s).normalize('NFKC').trim();
    t = t.replace(/[‐-‒–—―ー−]/g, '-');
    return t.toUpperCase();
}

async function loadDisposalHistoryPage(page = 1) {
    const tbody = document.getElementById('disposal-history-body');
    const loader = document.getElementById('loading-spinner');
    const safePage = Math.max(1, Number(page) || 1);

    if (loader) {
        loader.style.display = 'block';
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
        historyState.totalPages = 1;
        historyState.totalItems = 0;
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">履歴の取得に失敗しました</td></tr>`;
        }
    } finally {
        if (loader) {
            loader.style.display = 'none';
        }
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
    const tbody = document.getElementById('disposal-history-body');
    if (tbody) {
        tbody.innerHTML = '';
    }

    await loadDisposalHistoryPage(1);
}

function renderTable() {
    const tbody = document.getElementById('disposal-history-body');
    const paginationDiv = document.getElementById('pagination-controls');
    if (!tbody) return;

    if (historyState.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">廃棄履歴はありません</td></tr>';
        if (paginationDiv) {
            paginationDiv.innerHTML = '';
        }
        return;
    }

    tbody.innerHTML = historyState.items.map((item) => {
        const dateObj = new Date(item.disposed_at);
        const dateStr = Number.isNaN(dateObj.getTime())
            ? '-'
            : dateObj.toLocaleDateString('ja-JP') + ' ' + dateObj.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        return `
            <tr>
                <td style="padding: 12px 5px;">${escapeHtml(dateStr)}</td>
                <td style="padding: 12px 5px;">${escapeHtml(item.management_number || '-')}</td>
                <td style="padding: 12px 5px;">${escapeHtml(item.quantity)}</td>
                <td style="padding: 12px 5px;">${escapeHtml(item.reason || '－')}</td>
                <td style="padding: 12px 5px;">${escapeHtml(item.processed_by_id || '不明')}</td>
            </tr>
        `;
    }).join('');

    if (!paginationDiv) {
        return;
    }

    if (historyState.totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let html = '';
    const current = historyState.currentPage;
    html += `<button class="page-btn" ${current === 1 ? 'disabled' : ''} onclick="DisposalController.changePage(${current - 1})">＜</button>`;

    for (let i = 1; i <= historyState.totalPages; i++) {
        const activeClass = i === current ? 'active' : '';
        html += `<button class="page-btn ${activeClass}" onclick="DisposalController.changePage(${i})">${i}</button>`;
    }

    html += `<button class="page-btn" ${current === historyState.totalPages ? 'disabled' : ''} onclick="DisposalController.changePage(${current + 1})">＞</button>`;
    paginationDiv.innerHTML = html;
}
