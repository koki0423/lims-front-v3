import { Router } from '/js/router.js';
import { API } from '/js/api.js';
import { scanStudentIdWithRetry } from "/js/nfcReader.js";

const lendState = {
    data: {},
    history: {
        items: [],
        currentPage: 1,
        itemsPerPage: 20
    }
};

const returnState = {
    targetLending: null,
    inputData: {},
    history: {
        items: [],
        currentPage: 1,
        itemsPerPage: 20
    }
};

function toArray(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (data && Array.isArray(data.items)) {
        return data.items;
    }
    return [];
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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

function showApiError(err, fallbackMessage) {
    const message =
        err &&
            err.response &&
            err.response.data &&
            err.response.data.message
            ? err.response.data.message
            : fallbackMessage;

    alert(message);
}

window.LendReturnController = {
    async NfcRead(targetName) {
        const input = document.querySelector('input[name="' + targetName + '"]');

        if (!input) {
            console.error('target input not found:', targetName);
            return;
        }

        try {
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
        } catch (err) {
            console.error('scan error:', err);
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

        for (let pair of formData.entries()) {
            lendState.data[pair[0]] = pair[1];
        }

        Router.to('lend-confirm');
    },

    async submitLend() {
        try {
            const payload = {
                management_number: lendState.data.itemId,
                quantity: Number(lendState.data.qty),
                borrower_id: lendState.data.borrower,
                due_on: lendState.data.dueDate ? lendState.data.dueDate : null,
                lent_by_id: lendState.data.lender ? lendState.data.lender : null
            };

            await API.lending.register(payload);

            lendState.data = {};
            CommonController.showComplete('貸出登録が完了しました');
        } catch (err) {
            console.error('submitLend error:', err);
            showApiError(err, '貸出登録に失敗しました');
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
            Router.to('return-input');
        } catch (err) {
            console.error('triggerQuickReturn error:', err);
            showApiError(err, '返却対象の取得に失敗しました');
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

            returnState.targetLending = list[0];
            Router.to('return-input');
        } catch (err) {
            console.error('searchLending error:', err);
            showApiError(err, '貸出検索に失敗しました');
        }
    },

    saveReturnInput() {
        const form = document.getElementById('form-return');

        if (!form || !form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);
        returnState.inputData = {};

        for (let pair of formData.entries()) {
            returnState.inputData[pair[0]] = pair[1];
        }

        Router.to('return-confirm');
    },

    async submitReturn() {
        if (!returnState.targetLending) {
            alert('返却対象がありません');
            return;
        }

        const lendKey = getLendKey(returnState.targetLending);

        if (!lendKey) {
            alert('貸出番号が取得できません');
            return;
        }

        try {
            const payload = {
                quantity: Number(returnState.inputData.returnQty || getLendQuantity(returnState.targetLending) || 1),
                processed_by_id: returnState.inputData.returner,
                note: returnState.inputData.note ? returnState.inputData.note : null
            };

            await API.lending.returnAsset(lendKey, payload);

            returnState.targetLending = null;
            returnState.inputData = {};
            CommonController.showComplete('返却処理が完了しました');
        } catch (err) {
            console.error('submitReturn error:', err);
            showApiError(err, '返却処理に失敗しました');
        }
    },

    //ページネーション
    changeLendHistoryPerPage(value) {
        lendState.history.itemsPerPage = Number(value);
        lendState.history.currentPage = 1;
        renderLendHistory();
    },

    changeLendHistoryPage(page) {
        lendState.history.currentPage = Number(page);
        renderLendHistory();
    },

    changeReturnHistoryPerPage(value) {
        returnState.history.itemsPerPage = Number(value);
        returnState.history.currentPage = 1;
        renderReturnHistory();
    },

    changeReturnHistoryPage(page) {
        returnState.history.currentPage = Number(page);
        renderReturnHistory();
    },
    // ここまで

    async loadLendHistory() {
        const tbody = document.getElementById('lend-history-body');

        if (!tbody) {
            return;
        }

        try {
            const list = toArray(await API.lending.fetchLends({ limit: 100 }));

            lendState.history.items = list;
            lendState.history.currentPage = 1;

            renderLendHistory();
        } catch (err) {
            console.error('loadLendHistory error:', err);
            tbody.innerHTML = '<tr><td colspan="5">読み込みに失敗しました</td></tr>';
        }
    },

    async loadReturnHistory() {
        const tbody = document.getElementById('return-history-body');

        if (!tbody) {
            return;
        }

        try {
            const list = toArray(await API.lending.fetchReturns({ limit: 100 }));

            returnState.history.items = list;
            returnState.history.currentPage = 1;

            renderReturnHistory();
        } catch (err) {
            console.error('loadReturnHistory error:', err);
            tbody.innerHTML = '<tr><td colspan="5">読み込みに失敗しました</td></tr>';
        }
    },
};

function renderLendHistory() {
    const tbody = document.getElementById('lend-history-body');
    const pagination = document.getElementById('lend-history-pagination');

    if (!tbody) {
        return;
    }

    const items = lendState.history.items;
    const itemsPerPage = lendState.history.itemsPerPage;
    const currentPage = lendState.history.currentPage;

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        if (pagination) {
            pagination.innerHTML = '';
        }
        return;
    }

    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (lendState.history.currentPage > totalPages) {
        lendState.history.currentPage = totalPages;
    }

    const startIndex = (lendState.history.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = items.slice(startIndex, endIndex);

    let html = '';

    for (let item of pageItems) {
        html += `
            <tr>
                <td>${escapeHtml(item.management_number || '')}</td>
                <td>${escapeHtml(getLendQuantity(item))}</td>
                <td>${escapeHtml(item.borrower_id || '')}</td>
                <td>${escapeHtml(formatDate(item.lent_at || item.created_at || ''))}</td>
                <td>${escapeHtml(formatDate(item.due_on || ''))}</td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
    renderHistoryPagination(pagination, totalPages, lendState.history.currentPage, 'lend');
}

function renderReturnHistory() {
    const tbody = document.getElementById('return-history-body');
    const pagination = document.getElementById('return-history-pagination');

    if (!tbody) {
        return;
    }

    const items = returnState.history.items;
    const itemsPerPage = returnState.history.itemsPerPage;
    const currentPage = returnState.history.currentPage;

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        if (pagination) {
            pagination.innerHTML = '';
        }
        return;
    }

    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (returnState.history.currentPage > totalPages) {
        returnState.history.currentPage = totalPages;
    }

    const startIndex = (returnState.history.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = items.slice(startIndex, endIndex);

    let html = '';

    for (let item of pageItems) {
        html += `
            <tr>
                <td>${escapeHtml(item.management_number || '')}</td>
                <td>${escapeHtml(item.quantity || '')}</td>
                <td>${escapeHtml(item.borrower_id || '')}</td>
                <td>${escapeHtml(formatDate(item.lent_at || item.lent_on || item.created_at || ''))}</td>
                <td>${escapeHtml(formatDate(item.returned_at || item.processed_at || ''))}</td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
    renderHistoryPagination(pagination, totalPages, returnState.history.currentPage, 'return');
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

    let i = 1;
    for (i = 1; i <= totalPages; i++) {
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
            dateInput.value = new Date().toISOString().split('T')[0];
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
        window.LendReturnController.loadLendHistory();
    } else if (view === 'return-history') {
        window.LendReturnController.loadReturnHistory();
    }
}