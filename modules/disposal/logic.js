import { Router } from '../../js/router.js';

// 廃棄機能の状態管理
const disposalState = {
    data: {} // 入力データ
};

// 履歴データのモック（サーバーから取得するデータの代わり）
const mockHistory = [
    { id: 'OFS-20251101-001', name: "MacBook Air M2", reason: '画面破損', date: '2025-11-02', user: 'AB12345' },
    { id: 'OFS-20251015-005', name: "HDMIケーブル", reason: '老朽化', date: '2025-10-30', user: 'CD67890' }
];

window.DisposalController = {

    saveInput() {
        const form = document.getElementById('form-disposal');
        const formData = new FormData(form);
        for (let [key, val] of formData.entries()) {
            disposalState.data[key] = val;
        }
        console.log('Input Data:', disposalState.data);
    },

    // 入力画面 -> 確認画面
    toConfirm() {
        const form = document.getElementById('form-disposal');
        if (form && form.reportValidity()) {
            const formData = new FormData(form);
            for (let [key, val] of formData.entries()) {
                disposalState.data[key] = val;
            }
            Router.to('disposal-confirm');
        }
    },

    // 登録実行
    disposalSubmit() {
        console.log('Disposal Submit:', disposalState.data);
        disposalState.data = {};
        CommonController.showComplete('廃棄登録が完了しました');
    }
};

// 画面初期化処理
export function initDisposal(view) {
    if (view === 'input') {
        const form = document.getElementById('form-disposal');
        // Stateにデータがあるかチェック
        if (Object.keys(disposalState.data).length > 0) {
            // データがあるなら復元（戻るボタンで来た場合など）
            restoreFormData(form, disposalState.data);
        } else {
            // データがないなら初期値をセット（初回アクセス時）
            const dateInput = form.querySelector('input[name="date"]');
            if (dateInput) {
                const today = new Date().toISOString().split('T')[0];
                dateInput.value = today;
            }
        }
    }
    else if (view === 'confirm') {
        const display = document.getElementById('disp-confirm-view');
        if (display) {
            display.innerHTML = `
                <div class="info-row"><span class="info-label">備品番号</span><span>${disposalState.data.itemId || ''}</span></div>
                <div class="info-row"><span class="info-label">数量</span><span>${disposalState.data.qty || '1'}</span></div>
                <div class="info-row"><span class="info-label">登録者</span><span>${disposalState.data.user || ''}</span></div>
                <div class="info-row"><span class="info-label">登録日</span><span>${disposalState.data.date || ''}</span></div>
                <div class="info-row"><span class="info-label">廃棄理由</span><span>${disposalState.data.reason || ''}</span></div>
            `;
        }
    }
    else if (view === 'history') {
        const tbody = document.getElementById('disposal-history-body');
        if (tbody) {
            tbody.innerHTML = mockHistory.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td>${item.name}</td>
                    <td>${item.reason}</td>
                    <td>${item.date}</td>
                </tr>
            `).join('');
        }
    }
}

function restoreFormData(form, data) {
    Object.keys(data).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = data[key];
        }
    });
}