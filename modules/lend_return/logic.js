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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">候補がありません</td></tr>';
        return;
    }

    tbody.innerHTML = returnState.searchResults.map((item, index) => `
        <tr>
            <td>${escapeHtml(item.management_number || '')}</td>
            <td>${escapeHtml(getLendQuantity(item))}</td>
            <td>${escapeHtml(item.borrower_id || item.borrower || '')}</td>
            <td>${escapeHtml(formatDate(item.lent_at || item.created_at || ''))}</td>
            <td style="text-align:center;">
                <button class="sm-btn" onclick="LendReturnController.selectReturnTarget(${index})">選択</button>
            </td>
        </tr>
    `).join('');
}

function renderLendHistory() {
    const tbody = document.getElementById('lend-history-body');
    const pagination = document.getElementById('lend-history-pagination');

    if (!tbody) {
        return;
    }

    if (!lendState.history.items || lendState.history.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        if (pagination) {
            pagination.innerHTML = '';
        }
        return;
    }

    tbody.innerHTML = lendState.history.items.map((item) => `
        <tr>
            <td>${escapeHtml(item.management_number || '')}</td>
            <td>${escapeHtml(getLendQuantity(item))}</td>
            <td>${escapeHtml(item.borrower_id || '')}</td>
            <td>${escapeHtml(formatDate(item.lent_at || item.created_at || ''))}</td>
            <td>${escapeHtml(formatDate(item.due_on || ''))}</td>
        </tr>
    `).join('');

    renderHistoryPagination(pagination, lendState.history.totalPages, lendState.history.currentPage, 'lend');
}

function renderReturnHistory() {
    const tbody = document.getElementById('return-history-body');
    const pagination = document.getElementById('return-history-pagination');

    if (!tbody) {
        return;
    }

    if (!returnState.history.items || returnState.history.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        if (pagination) {
            pagination.innerHTML = '';
        }
        return;
    }

    tbody.innerHTML = returnState.history.items.map((item) => `
        <tr>
            <td>${escapeHtml(item.management_number || '')}</td>
            <td>${escapeHtml(item.quantity || '')}</td>
            <td>${escapeHtml(item.borrower_id || '')}</td>
            <td>${escapeHtml(formatDate(item.lent_at || item.lent_on || item.created_at || ''))}</td>
            <td>${escapeHtml(formatDate(item.returned_at || item.processed_at || ''))}</td>
        </tr>
    `).join('');

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

    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 10 && Math.abs(currentPage - i) > 2 && i !== 1 && i !== totalPages) {
            if (html.indexOf('...') === -1 || !html.endsWith('</span>')) {
                html += '<span style="padding:0 5px;">...</span>';
            }
            continue;
        }

        const activeClass = i === currentPage ? 'active' : '';
        if (type === 'lend') {
            html += `<button class="page-btn ${activeClass}" onclick="LendReturnController.changeLendHistoryPage(${i})">${i}</button>`;
        } else {
            html += `<button class="page-btn ${activeClass}" onclick="LendReturnController.changeReturnHistoryPage(${i})">${i}</button>`;
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
            alert('NFC読み取り中にエラーが発生しました');
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
        const tbody = document.getElementById('lend-history-body');
        if (!tbody) {
            return;
        }

        try {
            const response = await API.lending.fetchLends({
                limit: lendState.history.itemsPerPage,
                offset: (page - 1) * lendState.history.itemsPerPage
            });

            assignHistoryPage(lendState.history, response, page);
            renderLendHistory();
        } catch (error) {
            console.error('loadLendHistory error:', error);
            tbody.innerHTML = '<tr><td colspan="5">読み込みに失敗しました</td></tr>';
        }
    },

    async loadReturnHistory(page = 1) {
        const tbody = document.getElementById('return-history-body');
        if (!tbody) {
            return;
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
            tbody.innerHTML = '<tr><td colspan="5">読み込みに失敗しました</td></tr>';
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
                <div class="info-row"><span class="info-label">貸出番号</span><span style="font-size:0.8em">${escapeHtml(getLendKey(target))}</span></div>
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
