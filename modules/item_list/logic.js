import { Router } from '../../js/router.js';

// === モックデータ ===
const mockItems = [
    { id: 'OFS-001', name: 'MacBook Air M2', status: '正常', qty: 1 },
    { id: 'OFS-002', name: 'HDMIケーブル', status: '貸出中', qty: 5 },
    { id: 'OFS-003', name: 'オシロスコープ', status: '故障', qty: 1 },
    { id: 'OFS-004', name: '3Dプリンタ', status: '修理中', qty: 1 },
    { id: 'OFS-005', name: '古いPC', status: '廃棄済み', qty: 1 },
    { id: 'OFS-006', name: 'USBメモリ', status: '紛失', qty: 1 },
    { id: 'OFS-007', name: 'iPad Pro', status: '正常', qty: 2 }
];

// === 状態管理 ===
const itemListState = {
    currentFilter: null // null = 全表示, '正常' = 正常のみ表示...
};

// === コントローラー ===
window.ItemListController = {
    /**
     * フィルタを切り替える
     * @param {string} status - 絞り込みたいステータス
     */
    toggleFilter(status) {
        // 同じボタンを押したら解除（全表示に戻す）
        if (itemListState.currentFilter === status) {
            itemListState.currentFilter = null;
        } else {
            itemListState.currentFilter = status;
        }
        
        // 再描画
        renderList();
        updateFilterButtonStyles();
    },

    // 編集ボタン（仮）
    edit(id) {
        alert(`備品ID: ${id} の編集画面へ遷移します`);
    }
};

// === 画面初期化 ===
export function initItemList() {
    itemListState.currentFilter = null; // 初期化時は全表示
    renderList();
    updateFilterButtonStyles();
}

// 内部関数: リスト描画
function renderList() {
    const tbody = document.getElementById('item-list-body');
    if (!tbody) return;

    // フィルタリング実行
    const filteredItems = mockItems.filter(item => {
        if (!itemListState.currentFilter) return true; // フィルタなしなら全部通す
        return item.status === itemListState.currentFilter;
    });

    // HTML生成
    if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">該当する備品はありません</td></tr>';
        return;
    }

    tbody.innerHTML = filteredItems.map(item => {
        // ステータスに応じたバッジの色分け（CSSクラス）
        let badgeClass = 'badge-normal';
        if (item.status === '故障' || item.status === '紛失') badgeClass = 'badge-error';
        if (item.status === '貸出中' || item.status === '修理中') badgeClass = 'badge-warn';
        if (item.status === '廃棄済み') badgeClass = 'badge-gray';

        return `
            <tr>
                <td>${item.id}</td>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
                <td style="text-align:center;">
                    <button class="sm-btn" onclick="ItemListController.edit('${item.id}')">編集</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 内部関数: フィルタボタンの見た目更新
function updateFilterButtonStyles() {
    // 全てのフィルタボタンから active クラスを外す
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        
        // 現在選択中のステータスと一致するボタンだけ active にする
        if (btn.dataset.status === itemListState.currentFilter) {
            btn.classList.add('active');
        }
    });
}