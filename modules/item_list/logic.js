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

    // 編集モーダルを開く
    async edit(managementNumber) {
        console.log('Fetching pair for:', managementNumber);
        
        try {
            // 1. 新しいエンドポイントを叩く
            const data = await API.assets.getPair(managementNumber);
            
            // レスポンスの構造: { master: {...}, asset: {...} }
            const master = data.master;
            const asset = data.asset;

            console.log('Fetched data:', data);

            if (!master || !asset) {
                throw new Error('データの構造が不正です');
            }

            // 2. フォームに値をセット
            
            // ★重要: 更新(PUT)用に asset_id を隠しフィールドにセット
            document.getElementById('edit-asset-id').value = asset.asset_id;
            
            // マスタ情報 (読み取り専用エリア)
            document.getElementById('edit-name').value = master.name || '';
            document.getElementById('edit-code').value = master.management_number || '';
            
            // 編集可能エリア (asset側の情報)
            document.getElementById('edit-status').value = asset.status_id;
            document.getElementById('edit-location').value = asset.default_location || ''; // または asset.location
            document.getElementById('edit-owner').value = asset.owner || '';

            // 3. モーダル表示
            document.getElementById('edit-modal').style.display = 'flex';

        } catch (error) {
            console.error(error);
            alert('データの取得に失敗しました: ' + (error.message || 'Unknown Error'));
        }
    },

    // ★追加: モーダルを閉じる
    closeModal() {
        document.getElementById('edit-modal').style.display = 'none';
    },

    // ★追加: 更新実行
    async update() {
        const id = document.getElementById('edit-asset-id').value;

        // 送信データの作成
        const payload = {
            status_id: Number(document.getElementById('edit-status').value),
            default_location: document.getElementById('edit-location').value,
            owner: document.getElementById('edit-owner').value
            // 必要に応じて他のフィールドも
        };

        try {
            // 更新API呼び出し
            await API.assets.update(id, payload);

            alert('更新しました');
            this.closeModal();

            // リストを再読み込みして最新状態にする
            initItemList();

        } catch (error) {
            console.error(error);
            alert('更新に失敗しました: ' + error.message);
        }
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
        const mgmtNum = item.management_number || item.asset_id;

        return `
            <tr>
                <td style="padding: 12px 5px;">${displayId}</td>
                <td style="padding: 12px 5px;">${displayName}</td>
                <td style="padding: 12px 5px;">${item.quantity}</td>
                <td style="text-align:center; padding: 12px 5px;">
                    <span class="status-badge ${statusObj.class}">${statusObj.name}</span>
                </td>
                <td style="text-align:center; padding: 12px 5px;">
                    <button class="sm-btn" onclick="ItemListController.edit('${mgmtNum}')">編集</button>
                </td>
                <td style="text-align:center; padding: 12px 5px;">
                    <button class="sm-btn" onclick="ItemListController.lend('${item.asset_id}')">貸出</button>
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