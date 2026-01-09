import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';

// === 状態管理 ===
const itemListState = {
    items: [],
    currentFilter: null, // 空文字=全表示, "1"=正常, "2"=故障...

    // ページネーション用
    currentPage: 1,
    itemsPerPage: 20
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

        itemListState.currentPage = 1;
        renderList();
        updateFilterButtonStyles();
    },

    // 編集モーダルを開く
    async edit(managementNumber) {
        try {
            const data = await API.assets.getPair(managementNumber);
            const asset = data.asset;
            const master = data.master;

            // === 1. ID等のセット (共通) ===
            document.getElementById('edit-asset-id').value = asset.asset_id;
            document.getElementById('edit-name').value = master.name || '';
            document.getElementById('edit-code').value = asset.management_number;
            document.getElementById('disp-current-location').value = asset.location || '-';


            // === 2. 要素の取得 ===
            const qtyInput = document.getElementById('edit-qty');
            const qtyMsg = document.getElementById('qty-lock-msg');
            const statusSelect = document.getElementById('edit-status');
            const locInput = document.getElementById('edit-location');
            const notesInput = document.getElementById('edit-notes');
            const statusOriginalInput = document.getElementById('edit-status-original');

            // === 3. 値のセット ===
            qtyInput.value = asset.quantity;
            statusOriginalInput.value = String(asset.status_id);
            statusSelect.value = asset.status_id;
            locInput.value = asset.default_location || '';
            notesInput.value = asset.notes || '';

            // === 4. ロック状態の初期化 (リセット) ===
            // 一旦すべて有効化してから、条件に応じて無効化する
            statusSelect.disabled = false;
            locInput.disabled = false;
            notesInput.disabled = false;

            // 数量ロックの判定 (シリアル有無)
            const isSerial = (asset.serial && asset.serial.trim() !== "");
            if (isSerial) {
                qtyInput.disabled = true;
                qtyInput.style.backgroundColor = "#f5f5f5";
                if (qtyMsg) qtyMsg.style.display = "inline";
            } else {
                qtyInput.disabled = false;
                qtyInput.style.backgroundColor = "#fff";
                if (qtyMsg) qtyMsg.style.display = "none";
            }


            // === 5. ステータス別の特殊ロック処理 ===

            // ケースA: 貸出中 (ID: 4)
            // -> ステータス変更不可
            if (asset.status_id === 4) {
                statusSelect.disabled = true;
                // 念のため背景色も変えておくと親切かも
                // statusSelect.style.backgroundColor = "#f5f5f5";
            }

            // ケースB: 廃棄済み (ID: 5)
            // -> 備考以外は一切変更不可
            if (asset.status_id === 5) {
                statusSelect.disabled = true;
                qtyInput.disabled = true;
                locInput.disabled = true;

                qtyInput.style.backgroundColor = "#f5f5f5";
                locInput.style.backgroundColor = "#f5f5f5";
                // statusSelect.style.backgroundColor = "#f5f5f5";
            }

            // モーダル表示
            document.getElementById('edit-modal').style.display = 'flex';

        } catch (error) {
            console.error(error);
            alert('データの取得に失敗しました');
        }
    },

    closeModal() {
        document.getElementById('edit-modal').style.display = 'none';
    },

    async update() {
        const id = document.getElementById('edit-asset-id').value;

        const statusSelect = document.getElementById('edit-status');
        const statusOriginalVal = document.getElementById('edit-status-original').value;

        const locVal = document.getElementById('edit-location').value;
        const notesVal = document.getElementById('edit-notes').value;

        let statusId;

        // select が有効で、かつ値が入っているときはそれを採用（正常/故障/修理中/紛失）
        if (!statusSelect.disabled && statusSelect.value !== '') {
            statusId = Number(statusSelect.value);
        } else {
            // 貸出中(4) / 廃棄済み(5) など、option が無い or disabled で value="" のケース
            statusId = Number(statusOriginalVal);
        }

        const payload = {
            status_id: statusId,
            default_location: locVal,
            notes: notesVal,
        };

        const qtyInput = document.getElementById('edit-qty');
        if (!qtyInput.disabled) {
            payload.quantity = Number(qtyInput.value);
        }

        try {
            // PUT /assets/:asset_id
            await API.assets.update(id, payload);
            alert('更新しました');
            this.closeModal();

            if (typeof initItemList === 'function') {
                initItemList();
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error(error);
            alert('更新に失敗しました: ' + (error.response?.data?.error || error.message));
        }
    }
    ,

    // 表示件数変更
    changePerPage(val) {
        itemListState.itemsPerPage = Number(val);
        itemListState.currentPage = 1; // 件数変えたら1ページ目に戻す
        renderList();
    },

    // ページ切り替え
    changePage(page) {
        itemListState.currentPage = Number(page);
        renderList();
    },
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
    const paginationDiv = document.getElementById('pagination-controls');
    if (!tbody) return;

    // 1. フィルタリング
    const filteredItems = itemListState.items.filter(item => {
        if (itemListState.currentFilter === null || itemListState.currentFilter === '') {
            return true;
        }
        const statusId = item.status_id || 1;
        return String(statusId) === String(itemListState.currentFilter);
    });

    // 2. ページネーション計算
    const totalItems = filteredItems.length;
    const totalPages = Math.ceil(totalItems / itemListState.itemsPerPage) || 1;

    // 現在ページが総ページを超えていたら補正
    if (itemListState.currentPage > totalPages) {
        itemListState.currentPage = totalPages;
    }

    const startIndex = (itemListState.currentPage - 1) * itemListState.itemsPerPage;
    const endIndex = startIndex + itemListState.itemsPerPage;

    // 3. 表示するデータだけ切り出す
    const displayItems = filteredItems.slice(startIndex, endIndex);

    // 4. データ描画
    if (displayItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">該当する備品はありません</td></tr>';
        paginationDiv.innerHTML = '';
        return;
    }

    tbody.innerHTML = displayItems.map(item => {
        const statusId = item.status_id || 1;
        const statusObj = STATUS_MAP[statusId] || { name: '不明', class: 'badge-gray' };
        const displayId = item.management_number || item.asset_id || '-';
        const displayName = item.name || `(マスタID: ${item.asset_master_id})`;
        const mgmtNum = item.management_number || item.asset_id;
        const genreObj = AppState.genres.find(g => g.id === item.genre_id);
        const genreName = genreObj ? genreObj.name : '-';

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
            </tr>
        `;
    }).join('');

    // 5. ページネーションボタン描画
    renderPaginationControls(paginationDiv, totalPages, itemListState.currentPage);
}

// ページボタン生成ロジック
function renderPaginationControls(container, totalPages, currentPage) {
    if (!container) return;

    let html = '';

    // [前へ] ボタン
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    html += `<button class="page-btn" ${prevDisabled} onclick="ItemListController.changePage(${currentPage - 1})">＜</button>`;

    // ページ番号ボタン
    // ページ数が多すぎる場合の省略ロジックを入れるならここを調整
    for (let i = 1; i <= totalPages; i++) {
        // ページ数が多い場合、カレント周辺のみ表示するロジック
        if (totalPages > 10 && Math.abs(currentPage - i) > 2 && i !== 1 && i !== totalPages) {
            if (html.slice(-3) !== '...') html += '<span style="padding:0 5px;">...</span>';
            continue;
        }

        const activeClass = i === currentPage ? 'active' : '';
        html += `<button class="page-btn ${activeClass}" onclick="ItemListController.changePage(${i})">${i}</button>`;
    }

    // [次へ] ボタン
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    html += `<button class="page-btn" ${nextDisabled} onclick="ItemListController.changePage(${currentPage + 1})">＞</button>`;

    container.innerHTML = html;
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