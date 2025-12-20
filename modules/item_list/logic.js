import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';

// === 状態管理 ===
const itemListState = {
    items: [],
    currentFilter: null // 空文字=全表示, "1"=正常, "2"=故障...
};

// ステータス定義（JSONのstatus_idに対応）
const STATUS_MAP = {
    1: { name: '正常', class: 'badge-normal' },
    2: { name: '故障', class: 'badge-error' },
    3: { name: '修理中', class: 'badge-warn' },
    4: { name: '貸出中', class: 'badge-warn' },
    5: { name: '廃棄済み', class: 'badge-gray' },
    6: { name: '紛失', class: 'badge-error' }
};

window.ItemListController = {
    // フィルタ切り替え
    toggleFilter(status) {
        if (itemListState.currentFilter == status) {
            itemListState.currentFilter = null;
        } else {
            itemListState.currentFilter = status;
        }

        renderList();
        updateFilterButtonStyles();
    },

    // 編集画面へ（仮）
    edit(id) {
        console.log('Edit item:', id);
        alert(`備品ID: ${id} の編集画面へ`);
    }
};

// === 初期化処理 ===
export async function initItemList() {
    itemListState.currentFilter = '';
    updateFilterButtonStyles();

    const tbody = document.getElementById('item-list-body');
    const loader = document.getElementById('loading-spinner');

    if (tbody) tbody.innerHTML = '';
    if (loader) loader.style.display = 'block';

    try {
        // APIからデータ取得
        // 戻り値例: { items: [...], next_offset: 0, total: 1 }
        const response = await API.assets.fetchList();

        console.log("API Response:", response); // デバッグ用

        // 配列を取り出す (itemsプロパティの中にある)
        itemListState.items = response.items || [];

        renderList();

    } catch (error) {
        console.error('Fetch error:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">データの取得に失敗しました</td></tr>`;
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// === リスト描画 ===
function renderList() {
    const tbody = document.getElementById('item-list-body');
    if (!tbody) return;

    const filteredItems = itemListState.items.filter(item => {
        if (itemListState.currentFilter === null || itemListState.currentFilter === '') {
            return true;
        }

        // 表示と同じロジックで statusId を決める
        const statusId = item.status_id || 1;

        return String(statusId) === String(itemListState.currentFilter);
    });

    if (filteredItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">該当する備品はありません</td></tr>';
        return;
    }

    // HTML生成 (変更なし)
    tbody.innerHTML = filteredItems.map(item => {
        const statusId = item.status_id || 1;
        const statusObj = STATUS_MAP[statusId] || { name: '不明', class: 'badge-gray' };
        const displayId = item.management_number || item.asset_id || '-';
        const displayName = item.name || `(マスタID: ${item.asset_master_id})`;

        return `
            <tr>
                <td style="padding: 12px 5px;">${displayId}</td>
                <td style="padding: 12px 5px;">${displayName}</td>
                <td style="padding: 12px 5px;">${item.quantity}</td>
                <td style="text-align:center; padding: 12px 5px;">
                    <span class="status-badge ${statusObj.class}">${statusObj.name}</span>
                </td>
                <td style="text-align:center; padding: 12px 5px;">
                    <button class="sm-btn" onclick="ItemListController.edit('${item.asset_id}')">編集</button>
                </td>
            </tr>
        `;
    }).join('');
}

// === ボタンのアクティブ表示更新 ===
function updateFilterButtonStyles() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (String(btn.dataset.status) === String(itemListState.currentFilter)) {
            btn.classList.add('active');
        }
    });
}