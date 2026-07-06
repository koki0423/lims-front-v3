import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';
import { runWithButtonLoading, setControlsDisabled } from '../../js/ui_loading.js';
import { hidePageFeedback, showApiPageFeedback, showPageFeedback } from '../../js/ui_feedback.js';
import { clearViewState, loadViewState, saveViewState } from '../../js/view_state.js';

// === 定数定義 ===
// ステータス定義 (ID -> 表示名)
const STATUS_MAP = {
    1: { name: '正常', class: 'badge-normal' },
    2: { name: '故障', class: 'badge-error' },
    3: { name: '修理中', class: 'badge-warn' },
    4: { name: '貸出中', class: 'badge-warn' },
    5: { name: '廃棄済み', class: 'badge-gray' },
    6: { name: '紛失', class: 'badge-error' }
};

const SEARCH_VIEW_STATE_KEY = 'search-view';

// === 状態管理オブジェクト ===
const searchState = {
    result: null,       // 検索結果1件をここに保持
    candidates: [],     // 一覧画面用の検索結果リスト
    displayList: [],    // 画面に表示している、フィルタ・ソート済みのデータ
    currentFilter: null,// フィルタ状態 (null=全表示)
    sortKey: null,      // 'mgmt', 'name', 'status', 'location' など
    sortOrder: 'asc',   // 'asc'(昇順) か 'desc'(降順)
    query: {
        itemId: '',
        name: ''
    },
    searching: false
};

function resetSearchState({ clearPersisted = false } = {}) {
    searchState.result = null;
    searchState.candidates = [];
    searchState.displayList = [];
    searchState.currentFilter = null;
    searchState.sortKey = null;
    searchState.sortOrder = 'asc';
    searchState.query = {
        itemId: '',
        name: ''
    };
    searchState.searching = false;

    if (clearPersisted) {
        clearViewState(SEARCH_VIEW_STATE_KEY);
    }
}

function hasSearchQuery() {
    return Boolean(searchState.query.itemId || searchState.query.name);
}

function persistSearchState() {
    saveViewState(SEARCH_VIEW_STATE_KEY, {
        query: searchState.query,
        currentFilter: searchState.currentFilter,
        sortKey: searchState.sortKey,
        sortOrder: searchState.sortOrder,
        candidates: searchState.candidates
    });
}

function restoreSearchState() {
    const persisted = loadViewState(SEARCH_VIEW_STATE_KEY, {});
    searchState.query = {
        itemId: persisted.query?.itemId || '',
        name: persisted.query?.name || ''
    };
    searchState.currentFilter = persisted.currentFilter ?? null;
    searchState.sortKey = persisted.sortKey || null;
    searchState.sortOrder = persisted.sortOrder === 'desc' ? 'desc' : 'asc';
    searchState.candidates = Array.isArray(persisted.candidates) ? persisted.candidates : searchState.candidates;
}

function syncSearchQueryFromInputs() {
    const idInput = document.querySelector('input[name="itemId"]');
    const nameInput = document.getElementById('search-name');

    searchState.query.itemId = idInput ? idInput.value.trim() : '';
    searchState.query.name = nameInput ? nameInput.value.trim() : '';
}

function applySearchQueryToInputs() {
    const idInput = document.querySelector('input[name="itemId"]');
    const nameInput = document.getElementById('search-name');

    if (idInput) {
        idInput.value = searchState.query.itemId || '';
    }
    if (nameInput) {
        nameInput.value = searchState.query.name || '';
    }
}

function bindSearchInputPersistence() {
    const idInput = document.querySelector('input[name="itemId"]');
    const nameInput = document.getElementById('search-name');
    const inputs = [idInput, nameInput];

    for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        if (!input || input.dataset.searchStateBound === '1') {
            continue;
        }

        input.dataset.searchStateBound = '1';
        input.addEventListener('input', () => {
            syncSearchQueryFromInputs();
            persistSearchState();
        });
    }
}

function setSearchBusy(isBusy) {
    setControlsDisabled([
        'input[name="itemId"]',
        '#search-name',
        '#search-back-btn'
    ], isBusy);
}

function setSearchListBusy(isBusy) {
    setControlsDisabled([
        '#search-list-filter-controls .filter-btn',
        '#search-list-clear-btn',
        '#search-list-back-btn',
        '#search-candidates-body .sm-btn',
        '#search-list-condition-chips button'
    ], isBusy);
}

function createConditionChip(label, value, onRemove, isBusy = false) {
    const removeButton = onRemove
        ? `<button type="button" onclick="${onRemove}" ${isBusy ? 'disabled' : ''} aria-label="${escapeHtml(label)}を解除">×</button>`
        : '';
    return `<span class="list-condition-chip"><span>${escapeHtml(label)}: ${escapeHtml(value)}</span>${removeButton}</span>`;
}

function getSearchSortLabel() {
    if (!searchState.sortKey) {
        return '';
    }

    const labels = {
        mgmt: '備品番号',
        name: '備品名',
        status: '状態',
        location: '場所/利用者'
    };
    const baseLabel = labels[searchState.sortKey] || searchState.sortKey;
    return `${baseLabel} ${searchState.sortOrder === 'desc' ? '降順' : '昇順'}`;
}

function renderSearchListConditions() {
    const summary = document.getElementById('search-list-summary');
    const chips = document.getElementById('search-list-condition-chips');
    const clearButton = document.getElementById('search-list-clear-btn');

    if (!summary && !chips && !clearButton) {
        return;
    }

    const totalCandidates = Array.isArray(searchState.candidates) ? searchState.candidates.length : 0;
    const visibleCount = Array.isArray(searchState.displayList) ? searchState.displayList.length : 0;
    if (summary) {
        summary.textContent = totalCandidates === 0
            ? '候補はありません。'
            : `候補 ${totalCandidates}件中 ${visibleCount}件を表示しています。`;
    }

    const chipHtml = [];
    if (searchState.query.itemId) {
        chipHtml.push(createConditionChip('備品番号', searchState.query.itemId, "SearchController.removeQueryCondition('itemId')", searchState.searching));
    }
    if (searchState.query.name) {
        chipHtml.push(createConditionChip('備品名', searchState.query.name, "SearchController.removeQueryCondition('name')", searchState.searching));
    }
    if (searchState.currentFilter) {
        chipHtml.push(createConditionChip('状態', getStatusName(searchState.currentFilter), 'SearchController.clearStatusFilter()', searchState.searching));
    }
    if (searchState.sortKey) {
        chipHtml.push(createConditionChip('並び順', getSearchSortLabel(), 'SearchController.clearSortCondition()', searchState.searching));
    }

    if (chips) {
        chips.innerHTML = chipHtml.join('');
    }
    if (clearButton) {
        clearButton.disabled = chipHtml.length === 0 || searchState.searching;
    }
}

async function routeToSearchInputWithFeedback(message, tone = 'warning') {
    await Router.to('search-top');
    showPageFeedback('search-feedback', message, tone);
}

async function executeSearchFromState({ resetListState = false, emptyBehavior = 'stay' } = {}) {
    searchState.result = null;
    searchState.candidates = [];
    searchState.displayList = [];

    if (resetListState) {
        searchState.currentFilter = null;
        searchState.sortKey = null;
        searchState.sortOrder = 'asc';
    }

    persistSearchState();

    if (!hasSearchQuery()) {
        if (emptyBehavior === 'route-to-input') {
            await Router.to('search-top');
        }
        return;
    }

    let results = [];
    if (searchState.query.itemId) {
        const res = await API.assets.getPair(searchState.query.itemId);
        results = Array.isArray(res) ? res : [res];
    } else if (searchState.query.name) {
        results = await API.assets.searchByName(searchState.query.name);
    }

    if (!results || results.length === 0) {
        persistSearchState();
        if (emptyBehavior === 'route-to-input') {
            await routeToSearchInputWithFeedback('該当する備品は見つかりませんでした。', 'warning');
        } else {
            showPageFeedback('search-feedback', '該当する備品は見つかりませんでした。', 'warning');
        }
        return;
    }

    await AppState.loadGenres({ all: true });

    if (results.length === 1) {
        searchState.result = formatPairData(results[0]);
        searchState.candidates = [];
        persistSearchState();
        Router.to('search-result');
        return;
    }

    searchState.candidates = results;
    persistSearchState();
    Router.to('search-list');
}

// === ヘルパー関数 ===
function genreById(id) {
    return AppState.getGenreById(id, { all: true });
}

function getStatusName(id) {
    const status = STATUS_MAP[Number(id)];
    return status ? status.name : '不明';
}

// APIレスポンス (master + asset) を画面表示用のフラットなオブジェクトに変換
function formatPairData(data) {
    const m = data.master || {};
    const a = data.asset || {};

    const g = genreById(m.genre_id);

    return {
        // 表示に必要な情報をフラットにまとめる
        name: m.name || a.name || '(名称未設定)',
        management_number: m.management_number || a.management_number,
        manufacturer: m.manufacturer,
        model: m.model,
        serial: a.serial,
        genre_name: g ? g.name : '-',

        // 場所: 現在地(location)があれば優先、なければ定位置(default)
        current_location: a.location || a.default_location || '-',

        purchased_at: a.purchased_at,
        owner: a.owner,             // 登録者/管理者
        status_id: a.status_id,     // ステータスID
        status_name: getStatusName(a.status_id),

        // 備考: APIによっては notes だったり remarks だったりするので調整
        notes: a.notes || a.remarks || m.notes || ''
    };
}


// === コントローラー ===
window.SearchController = {
    async performSearch() {
        if (searchState.searching) {
            return;
        }

        searchState.searching = true;
        hidePageFeedback('search-feedback');
        setSearchBusy(true);

        try {
            await runWithButtonLoading('#search-submit-btn', { busyText: '検索中...' }, async () => {
                syncSearchQueryFromInputs();
                if (!hasSearchQuery()) {
                    showPageFeedback('search-feedback', '検索条件を入力してください。', 'error');
                    return;
                }
                await executeSearchFromState({ resetListState: true, emptyBehavior: 'stay' });
            });
        } catch (e) {
            console.error(e);
            showApiPageFeedback('search-feedback', e, '検索中にエラーが発生しました。');
        } finally {
            searchState.searching = false;
            setSearchBusy(false);
        }
    },
    // フィルタ切り替え
    toggleFilter(status) {
        if (String(searchState.currentFilter) === String(status)) {
            searchState.currentFilter = null;
        } else {
            searchState.currentFilter = status;
        }

        persistSearchState();
        initSearchList();
        this.updateFilterStyles();
    },

    // フィルタボタンの見た目更新
    updateFilterStyles() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (String(btn.dataset.status) === String(searchState.currentFilter)) {
                btn.classList.add('active');
            }
        });
    },

    // ソート切り替え
    sortBy(key) {
        // 同じ列をクリックしたら昇順・降順を反転
        if (searchState.sortKey === key) {
            searchState.sortOrder = searchState.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            // 違う列ならその列で昇順リセット
            searchState.sortKey = key;
            searchState.sortOrder = 'asc';
        }
        persistSearchState();
        initSearchList(); // 再描画
    },

    clearStatusFilter() {
        searchState.currentFilter = null;
        persistSearchState();
        initSearchList();
        this.updateFilterStyles();
    },

    clearSortCondition() {
        searchState.sortKey = null;
        searchState.sortOrder = 'asc';
        persistSearchState();
        initSearchList();
    },

    async removeQueryCondition(key) {
        if (searchState.searching || !Object.prototype.hasOwnProperty.call(searchState.query, key)) {
            return;
        }

        searchState.query[key] = '';
        searchState.searching = true;
        setSearchListBusy(true);
        try {
            await executeSearchFromState({ resetListState: false, emptyBehavior: 'route-to-input' });
        } catch (error) {
            console.error(error);
            showApiPageFeedback('search-list-feedback', error, '検索条件の更新に失敗しました。');
        } finally {
            searchState.searching = false;
            setSearchListBusy(false);
            renderSearchListConditions();
        }
    },

    clearListConditions() {
        if (searchState.searching) {
            return;
        }

        searchState.query = { itemId: '', name: '' };
        searchState.currentFilter = null;
        searchState.sortKey = null;
        searchState.sortOrder = 'asc';
        searchState.result = null;
        searchState.candidates = [];
        searchState.displayList = [];
        persistSearchState();
        Router.to('search-top');
    },

    // 一覧画面で「詳細」ボタンを押したときの処理
    selectCandidate(index) {
        const rawData = searchState.displayList[index];

        if (!rawData) {
            showPageFeedback('search-list-feedback', 'データの取得に失敗しました。再検索してください。', 'error');
            return;
        }

        // フォーマットして詳細画面用Stateにセット
        searchState.result = formatPairData(rawData);
        persistSearchState();
        Router.to('search-result');
    },

    // 戻るボタンの挙動
    backToSearch() {
        searchState.result = null;
        Router.to('search-top');
    }
};

// === 画面初期化 (result.html 表示時) ===
export function initSearch(view) {
    if (view === 'input') {
        resetSearchState({ clearPersisted: true });
        hidePageFeedback('search-feedback');
        applySearchQueryToInputs();
        return;
    }

    if (view !== 'result') return;

    const data = searchState.result;
    if (!data) {
        Router.to('search-top').then(() => {
            showPageFeedback('search-feedback', '検索結果がありません。検索条件を確認してください。', 'warning');
        });
        return;
    }

    // 値をセットするヘルパー
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val === null || val === undefined || val === '') ? '-' : val;
    };

    setVal('disp-mgmt-num', data.management_number); // ★追加
    setVal('disp-status', data.status_name);       // ★追加

    setVal('disp-name', data.name);
    setVal('disp-maker', data.manufacturer);
    setVal('disp-model', data.model);
    setVal('disp-serial', data.serial);
    setVal('disp-genre', data.genre_name);
    setVal('disp-location', data.current_location);

    // 日付整形 (YYYY-MM-DD)
    let dateStr = '-';
    if (data.purchased_at) {
        try {
            dateStr = new Date(data.purchased_at).toLocaleDateString('ja-JP');
        } catch (e) { }
    }
    setVal('disp-date', dateStr);

    setVal('disp-registrant', data.owner);
    setVal('disp-remarks', data.notes);
}

// === 画面初期化 (list.html 表示時) ===
// export function initSearchList() {
//     const tbody = document.getElementById('search-candidates-body');
//     if (!tbody) return;

//     // ボタンのスタイル初期化
//     if (window.SearchController.updateFilterStyles) {
//         window.SearchController.updateFilterStyles();
//     }

//     if (!searchState.candidates || searchState.candidates.length === 0) {
//         tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
//         return;
//     }

//     // フィルタリング処理
//     let filteredCandidates = searchState.candidates.filter(item => {
//         if (!searchState.currentFilter) return true;
//         const s = item.asset ? item.asset.status_id : 1;
//         return String(s) === String(searchState.currentFilter);
//     });

//     // ソート処理
//     if (searchState.sortKey) {
//         list.sort((a, b) => {
//             const getVal = (obj, key) => {
//                 const m = obj.master || {};
//                 const as = obj.asset || {};

//                 switch (key) {
//                     case 'mgmt': return m.management_number || as.management_number || '';
//                     case 'name': return m.name || '';
//          // もしSearchController内に入れてないなら、HTML側のonclickと同様の呼び出しが必要
//          // 簡易的には:
//          document.querySelectorAll('.sort-header').forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
//          const activeTh = document.querySelector(`.sort-header[data-key="${searchState.sortKey}"]`);
//          if (activeTh) activeTh.classList.add('sort-' + searchState.sortOrder);
//     }
// }

// === 画面初期化 (list.html 表示時) ===
export function initSearchList() {
    const tbody = document.getElementById('search-candidates-body');
    if (!tbody) return;

    if (!searchState.candidates || searchState.candidates.length === 0) {
        restoreSearchState();
    }
    hidePageFeedback('search-list-feedback');
    renderSearchListConditions();

    // ボタンのスタイル初期化
    if (window.SearchController.updateFilterStyles) {
        window.SearchController.updateFilterStyles();
    }

    if (!searchState.candidates || searchState.candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        showPageFeedback('search-list-feedback', '検索結果がありません。再検索してください。', 'warning');
        renderSearchListConditions();
        return;
    }

    // 1. フィルタリング処理
    // ★修正: ここで const ではなく let list にして、結果を受ける
    let list = searchState.candidates.filter(item => {
        if (!searchState.currentFilter) return true;
        const s = item.asset ? item.asset.status_id : 1;
        return String(s) === String(searchState.currentFilter);
    });

    // 2. ソート処理
    if (searchState.sortKey) {
        // ★修正: ここで filteredCandidates ではなく list をソートする
        list.sort((a, b) => {
            const getVal = (obj, key) => {
                const m = obj.master || {};
                const as = obj.asset || {};

                switch (key) {
                    case 'mgmt': return m.management_number || as.management_number || '';
                    case 'name': return m.name || '';
                    // case 'qty': return Number(as.quantity || 0); // 今回の表示に数量はないので不要かも
                    case 'status': return Number(as.status_id || 0);
                    case 'location': return as.location || as.default_location || as.owner || '';
                    default: return '';
                }
            };

            const valA = getVal(a, searchState.sortKey);
            const valB = getVal(b, searchState.sortKey);

            if (valA < valB) return searchState.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return searchState.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 3. 表示用リストをStateに保存 (重要)
    searchState.displayList = list;

    // ゼロチェック (list を見る)
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state">該当する条件の備品はありません</td></tr>';
        showPageFeedback('search-list-feedback', '条件に一致する備品はありません。絞り込み条件を確認してください。', 'warning');
        renderSearchListConditions();
        return;
    }

    // 4. map処理 (★修正: list を map する)
    tbody.innerHTML = list.map((item, index) => {
        const m = item.master || {};
        const a = item.asset || {};
        const statusInfo = STATUS_MAP[Number(a.status_id)] || { name: '不明', class: 'badge-gray' };

        const mgmtNum = m.management_number || a.management_number || '-';
        const location = a.location || a.default_location || a.owner || '-';

        return `
            <tr>
                <td class="table-cell-compact">${escapeHtml(mgmtNum)}</td>
                <td class="table-cell-compact">${escapeHtml(m.name || '-')}</td>
                <td class="table-cell-compact">
                    <span class="status-badge ${statusInfo.class}">${statusInfo.name}</span>
                </td>
                <td class="table-cell-compact">${escapeHtml(location)}</td>
                <td class="table-cell-compact table-cell-center">
                    <button class="sm-btn" onclick="SearchController.selectCandidate(${index})">
                        詳細
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    updateSortArrows();
    persistSearchState();
    renderSearchListConditions();
}

function updateSortArrows() {
    // 1. いったん全部のヘッダーからクラスを消す
    document.querySelectorAll('.sort-header').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');

        // 2. 現在ソート中のキーと一致するヘッダーだけにクラスをつける
        if (th.dataset.key === searchState.sortKey) {
            th.classList.add('sort-' + searchState.sortOrder);
        }
    });
}
