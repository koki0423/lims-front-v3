import { Router } from '../../js/router.js';

// === 状態管理 ===
const lendState = {
    data: {}
};

const returnState = {
    targetLending: null, // 検索でヒットした貸出情報
    inputData: {}        // 返却時に入力した情報
};

// === モックデータ: 現在貸出中のリスト ===
// 返却機能のテスト用データ
const mockActiveLendings = [
    {
        lendingId: '01K5BX9WF8TMF40YKJWF09HPZC',
        itemId: 'OFS-20251101-0001',
        itemName: 'MacBook Air M2',
        borrower: 'AB12345',
        lender: 'STAFF01',
        dueDate: '2025-12-31',
        qty: 1
    },
    {
        lendingId: '01K5BXA2G9XYZ1234567890ABC',
        itemId: 'OFS-20251101-0002',
        itemName: 'オシロスコープ',
        borrower: 'CD67890',
        lender: 'STAFF01',
        dueDate: '2025-12-20',
        qty: 1
    }
];

// === 履歴用モックデータ (新規追加) ===
const mockLendingHistory = [
    { itemId: 'OFS-20251101-0001', qty: 1, borrower: 'AB12345', regDate: '2025-11-01', dueDate: '2025-12-31' },
    { itemId: 'OFS-20251101-0003', qty: 1, borrower: 'CD67890', regDate: '2025-11-10', dueDate: '2025-11-20' }
];

const mockReturnHistory = [
    { itemId: 'OFS-20251101-0002', qty: 1, borrower: 'AB12345', regDate: '2025-10-01', returnDate: '2025-10-15' },
    { itemId: 'OFS-20251101-0004', qty: 2, borrower: 'EF12345', regDate: '2025-09-20', returnDate: '2025-09-25' }
];

// === コントローラー ===
window.LendReturnController = {
    // --- 貸出 ---
    saveLendInput() {
        const form = document.getElementById('form-lend');
        if (form && form.reportValidity()) {
            const formData = new FormData(form);
            for (let [key, val] of formData.entries()) {
                lendState.data[key] = val;
            }
            Router.to('lend-confirm');
        }
    },

    submitLend() {
        console.log('Lending Submit:', lendState.data);
        lendState.data = {};
        CommonController.showComplete('貸出登録が完了しました');
    },

    // 貸出履歴の「返却」ボタン押下時
    triggerQuickReturn(itemId) {
        alert(`備品番号: ${itemId} の返却処理へ進みます(デモ)`);
        // 必要ならここで return-input 画面へデータを持って遷移させることも可能
    },

    // --- 返却 ---
    // P12: 貸出情報の検索
    searchLending() {
        const query = document.getElementById('return-search-query').value;
        if (!query) {
            alert('備品番号または貸出先を入力してください');
            return;
        }

        // モックデータから検索 (本来はAPIコール)
        const hit = mockActiveLendings.find(item => item.itemId === query || item.borrower === query);

        if (hit) {
            returnState.targetLending = hit; // 検索結果を保持
            console.log('Hit:', hit);
            Router.to('return-input');
        } else {
            alert('該当する貸出情報が見つかりません。\n(テスト用: OFS-20251101-0001 で検索してみてください)');
        }
    },

    // P13: 返却情報の入力保存
    saveReturnInput() {
        const form = document.getElementById('form-return');
        if (form && form.reportValidity()) {
            const formData = new FormData(form);
            for (let [key, val] of formData.entries()) {
                returnState.inputData[key] = val;
            }
            Router.to('return-confirm');
        }
    },

    submitReturn() {
        console.log('Return Submit:', {
            original: returnState.targetLending,
            returnInfo: returnState.inputData
        });
        // alert('返却処理が完了しました');
        // returnState.targetLending = null;
        // returnState.inputData = {};
        // Router.to('return-menu');
        returnState.targetLending = null;
        returnState.inputData = {};
        CommonController.showComplete('返却処理が完了しました');
    }

};

// === 画面初期化 ===
export function initLendReturn(view) {
    // 貸出確認画面
    if (view === 'lend-confirm') {
        const display = document.getElementById('lend-confirm-view');
        if (display) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${lendState.data.itemId}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${lendState.data.qty}</span></div>
                <div class="info-row"><span class="info-label">貸出先</span><span>${lendState.data.borrower}</span></div>
                <div class="info-row"><span class="info-label">返却予定</span><span>${lendState.data.dueDate}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${lendState.data.lender}</span></div>
            `;
        }
    }
    // 返却入力画面 (検索結果を表示)
    else if (view === 'return-input') {
        const target = returnState.targetLending;
        if (!target) {
            alert('不正な遷移です');
            Router.to('return-search');
            return;
        }

        // 検索結果(読み取り専用)をDOMにセット
        document.getElementById('disp-lending-id').value = target.lendingId;
        document.getElementById('disp-qty').value = target.qty;
        document.getElementById('disp-borrower').value = target.borrower;

        // 返却日のデフォルト
        const dateInput = document.querySelector('input[name="returnDate"]');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    }
    // 返却確認画面
    else if (view === 'return-confirm') {
        const display = document.getElementById('return-confirm-view');
        const target = returnState.targetLending;
        const input = returnState.inputData;

        if (display && target) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">貸出番号</span><span style="font-size:0.8em">${target.lendingId}</span></div>
                <div class="info-row"><span class="info-label">備品</span><span>${target.itemName} (${target.itemId})</span></div>
                <div class="info-row"><span class="info-label">返却日</span><span>${input.returnDate}</span></div>
                <div class="info-row"><span class="info-label">実行者</span><span>${input.returner}</span></div>
            `;
        }
    }
    // 貸出履歴の描画
    if (view === 'lend-history') {
        const tbody = document.getElementById('lend-history-body');
        if (tbody) {
            tbody.innerHTML = mockLendingHistory.map(item => `
                <tr>
                    <td>${item.itemId}</td>
                    <td>${item.qty}</td>
                    <td>${item.borrower}</td>
                    <td>${item.regDate}</td>
                    <td>${item.dueDate}</td>
                    <td style="text-align:center;">
                        <button class="sm-btn" onclick="LendReturnController.triggerQuickReturn('${item.itemId}')">返却</button>
                    </td>
                </tr>
            `).join('');
        }
    }
    // 返却履歴の描画
    else if (view === 'return-history') {
        const tbody = document.getElementById('return-history-body');
        if (tbody) {
            tbody.innerHTML = mockReturnHistory.map(item => `
                <tr>
                    <td>${item.itemId}</td>
                    <td>${item.qty}</td>
                    <td>${item.borrower}</td>
                    <td>${item.regDate}</td>
                    <td>${item.returnDate}</td>
                </tr>
            `).join('');
        }
    }
}