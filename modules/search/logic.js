import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';

// === 定数定義 ===
const GENRES = [
    { id: 1, code: 'IND', name: '個人' },
    { id: 2, code: 'OFS', name: '事務' },
    { id: 3, code: 'FAC', name: 'ファシリティ' },
    { id: 4, code: 'EMB', name: '組込みシステム' },
    { id: 5, code: 'ADV', name: '高度情報演習' },
];

// ステータス定義 (ID -> 表示名)
const STATUS_MAP = {
    1: '正常',
    2: '故障',
    3: '修理中',
    4: '貸出中',
    5: '廃棄済み',
    6: '紛失'
};

// === 状態管理オブジェクト ===
const searchState = {
    result: null, // 検索結果1件をここに保持
    candidates: [],   // 一覧画面用の検索結果リスト
};

// === ヘルパー関数 ===
function genreById(id) {
    return GENRES.find(g => g.id === Number(id)) || null;
}

function getStatusName(id) {
    return STATUS_MAP[Number(id)] || '不明';
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

            // === 分岐ロジック ===

            if (results.length === 1) {
                // ★ 1件だけなら、直接詳細画面へ (UX向上)
                // formatPairDataを通して整形し、stateにセット
                searchState.result = formatPairData(results[0]);
                Router.to('search-result'); // 詳細画面へ
            } else {
                // ★ 複数件なら、候補リストをstateに保存して一覧画面へ
                searchState.candidates = results;
                Router.to('search-list');   // 一覧画面へ (router.jsへの登録が必要)
            }

        } catch (e) {
            console.error(e);
            alert('検索中にエラーが発生しました');
        }
    },

    // ★追加: 一覧画面で「詳細」ボタンを押したときの処理
    selectCandidate(index) {
        // メモリ上の配列からデータを取り出す (API通信なし！)
        const rawData = searchState.candidates[index];

        if (!rawData) {
            alert('データの取得に失敗しました');
            return;
        }

        // 整形して詳細表示用stateにセット
        searchState.result = formatPairData(rawData);

        // 詳細画面へ遷移
        Router.to('search-result');
    },

    backToSearch() {
        searchState.result = null;
        Router.to('search-top');
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
export function initSearchList() {
    const tbody = document.getElementById('search-candidates-body');
    if (!tbody) return;

    if (!searchState.candidates || searchState.candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">データがありません</td></tr>';
        return;
    }

    tbody.innerHTML = searchState.candidates.map((item, index) => {
        // データ整形 (リスト表示用に簡易的なもの)
        const m = item.master || {};
        const a = item.asset || {};
        const statusName = getStatusName(a.status_id);
        const mgmtNum = m.management_number || a.management_number || '-';
        const location = a.location || a.default_location || a.owner || '-';

        return `
            <tr>
                <td style="padding: 12px 5px;">${mgmtNum}</td>
                <td style="padding: 12px 5px;">${m.name || '-'}</td>
                <td style="padding: 12px 5px;">
                    <span class="status-badge status-${a.status_id}">${statusName}</span>
                </td>
                <td style="padding: 12px 5px;">${location}</td>
                <td style="text-align: center; padding: 12px 5px;">
                    <button class="sm-btn" onclick="SearchController.selectCandidate(${index})">
                        詳細
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}