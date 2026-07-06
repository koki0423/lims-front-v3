import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';

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

// === 状態管理オブジェクト ===
const searchState = {
    result: null,       // 検索結果1件をここに保持
    candidates: [],     // 一覧画面用の検索結果リスト
    displayList: [],    // 画面に表示している、フィルタ・ソート済みのデータ
    currentFilter: null,// フィルタ状態 (null=全表示)
    sortKey: null,      // 'mgmt', 'name', 'status', 'location' など
    sortOrder: 'asc'    // 'asc'(昇順) か 'desc'(降順)
};

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
        searchState.result = null;
        searchState.candidates = [];
        searchState.currentFilter = null;

        const idInput = document.querySelector('input[name="itemId"]'); // 備品番号
        const nameInput = document.getElementById('search-name');       // 備品名

        const idQuery = idInput ? idInput.value.trim() : '';
        const nameQuery = nameInput ? nameInput.value.trim() : '';

        if (!idQuery && !nameQuery) {
            alert('検索条件を入力してください');
            return;
        }

        try {
            let results = [];

            // A. 管理番号検索 (1件または0件想定だが、配列で受け取る設計にしておくと汎用的)
            if (idQuery) {
                // APIが単一オブジェクトを返す場合は [] で囲む、配列ならそのまま
                const res = await API.assets.getPair(idQuery);
                results = Array.isArray(res) ? res : [res];
            }
            // B. 名前検索 (複数件ヒットするエンドポイント)
            else if (nameQuery) {
                // GET /api/v2/assets/search?name=xxx
                results = await API.assets.searchByName(nameQuery);
            }

            if (!results || results.length === 0) {
                alert('該当する備品は見つかりませんでした');
                return;
            }

            await AppState.loadGenres({ all: true });

            // === 分岐ロジック ===
            if (results.length === 1) {
                // 1件だけなら、直接詳細画面へ (UX向上)
                // formatPairDataを通して整形し、stateにセット
                searchState.result = formatPairData(results[0]);
                Router.to('search-result'); // 詳細画面へ
            } else {
                // 複数件なら、候補リストをstateに保存して一覧画面へ
                searchState.candidates = results;
                Router.to('search-list');   // 一覧画面へ (router.jsへの登録が必要)
            }

        } catch (e) {
            console.error(e);
            alert('検索中にエラーが発生しました');
        }
    },
    // フィルタ切り替え
    toggleFilter(status) {
        if (String(searchState.currentFilter) === String(status)) {
            searchState.currentFilter = null;
        } else {
            searchState.currentFilter = status;
        }

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
        initSearchList(); // 再描画
    },

    // 一覧画面で「詳細」ボタンを押したときの処理
    selectCandidate(index) {
        const rawData = searchState.displayList[index];

        if (!rawData) {
            alert('データの取得に失敗しました');
            return;
        }

        // フォーマットして詳細画面用Stateにセット
        searchState.result = formatPairData(rawData);
        Router.to('search-result');
    },

    // 戻るボタンの挙動
    backToSearch() {
        // 詳細表示中のデータをクリア
        searchState.result = null;

        // 候補リスト(candidates)を持っているかチェック
        if (searchState.candidates && searchState.candidates.length > 0) {
            // 一覧経由できた場合 -> 一覧画面に戻る
            Router.to('search-list');
        } else {
            // 直接1件ヒットした場合 -> 検索トップに戻る
            Router.to('search-top');
        }
    }
};

// === 画面初期化 (result.html 表示時) ===
export function initSearch(view) {
    if (view !== 'result') return;

    const data = searchState.result;
    if (!data) {
        alert('検索結果がありません');
        // Router.to('search-top'); 
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

    // ボタンのスタイル初期化
    if (window.SearchController.updateFilterStyles) {
        window.SearchController.updateFilterStyles();
    }

    if (!searchState.candidates || searchState.candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
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
