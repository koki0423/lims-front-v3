import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';

// 状態
const searchState = {
    joinedAssets: null,   // master と join 済みの配列
    masters: null,
    loaded: false,
};

// ジャンル定義（Search.js そのまま）
const GENRES = [
    { id: 1, code: 'IND', name: '個人' },
    { id: 2, code: 'OFS', name: '事務' },
    { id: 3, code: 'FAC', name: 'ファシリティ' },
    { id: 4, code: 'EMB', name: '組込みシステム' },
    { id: 5, code: 'ADV', name: '高度情報演習' },
];

function genreById(id) {
    const target = Number(id);
    for (let i = 0; i < GENRES.length; i++) {
        if (GENRES[i].id === target) {
            return GENRES[i];
        }
    }
    return null;
}

// 管理番号のフォールバック生成（date-fns なし版）
function buildMgmtCode(master, asset) {
    if (!master || !master.asset_master_id) {
        return '';
    }

    const g = genreById(master.genre_id);
    const genreCode = g ? g.code : '';

    let dateSrc = null;
    if (master.created_at) {
        dateSrc = master.created_at;
    } else if (asset && asset.purchased_at) {
        dateSrc = asset.purchased_at;
    }

    let ymd = '';
    if (dateSrc) {
        try {
            const d = new Date(dateSrc);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                ymd = '' + y + m + day;
            }
        } catch (e) {
            console.warn('date parse error:', e);
            ymd = '';
        }
    }

    const idPadded = String(master.asset_master_id).padStart(4, '0');

    if (!genreCode || !ymd) {
        return '';
    }
    return genreCode + '-' + ymd + '-' + idPadded;
}

// 文字列正規化
function normalize(str) {
    if (!str) {
        return '';
    }
    return String(str).toLowerCase().trim();
}

function extractListPayload(resData, preferredKeys) {
    if (Array.isArray(resData)) {
        return resData;
    }
    if (!resData || typeof resData !== 'object') {
        return [];
    }

    if (Array.isArray(resData.items)) {
        return resData.items;
    }

    const data = resData.data;
    if (Array.isArray(data)) {
        return data;
    }
    if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) {
            return data.items;
        }
    }

    // 呼び出し元が示す候補キー
    if (preferredKeys && Array.isArray(preferredKeys)) {
        for (let i = 0; i < preferredKeys.length; i++) {
            const k = preferredKeys[i];
            const v = resData[k];
            if (Array.isArray(v)) {
                return v;
            }
            if (v && typeof v === 'object' && Array.isArray(v.items)) {
                return v.items;
            }
        }
    }

    const entries = Object.entries(resData);
    for (let i = 0; i < entries.length; i++) {
        const pair = entries[i];
        const v = pair[1];
        if (Array.isArray(v) && (v.length === 0 || typeof v[0] === 'object')) {
            return v;
        }
    }

    return [];
}

// masters + assets を 1 回だけ取得して join
async function loadJoinedAssetsOnce() {
    if (searchState.loaded && Array.isArray(searchState.joinedAssets)) {
        return searchState.joinedAssets;
    }

    try {
        // Search.js: Promise.all([fetchMasters, fetchAssets]) の移植
        const results = await Promise.all([
            API.assets.fetchMasters(),       // /api/v2/assets/masters
            API.assets.fetchList(),          // /api/v2/assets
        ]);

        const mRes = results[0];
        const aRes = results[1];

        const masters = extractListPayload(
            mRes,
            ['masters', 'asset_masters', 'results', 'list', 'rows']
        );
        const assets = extractListPayload(
            aRes,
            ['assets', 'results', 'list', 'rows']
        );

        searchState.masters = masters;

        // master.asset_master_id -> master
        const masterMap = new Map();
        for (let i = 0; i < masters.length; i++) {
            const mm = masters[i];
            masterMap.set(mm.asset_master_id, mm);
        }

        const joined = [];
        for (let i = 0; i < assets.length; i++) {
            const ai = assets[i]; // AssetResponse
            const master = masterMap.get(ai.asset_master_id) || {};
            const g = genreById(master.genre_id);

            // master.management_number（優先）→ asset.management_number → フォールバック生成
            const mgmt =
                master.management_number ||
                ai.management_number ||
                buildMgmtCode(master, ai);

            const joinedItem = {
                // Asset 側の情報
                ...ai,
                // Master 側の情報をマージ
                name: master.name,
                manufacturer: master.manufacturer,
                model: master.model,
                genre_id: master.genre_id,
                genre_code: g ? g.code : undefined,
                genre_name: g ? g.name : undefined,
                management_number: mgmt,
            };

            joined.push(joinedItem);
        }

        searchState.joinedAssets = joined;
        searchState.loaded = true;

        console.log('Joined assets:', joined);
        return joined;
    } catch (e) {
        console.error('API エラー:', e);
        alert('備品情報の取得に失敗しました');
        searchState.joinedAssets = [];
        searchState.masters = [];
        searchState.loaded = false;
        throw e;
    }
}

// ==== 画面から叩かれるコントローラ ====
window.SearchController = {
    async performSearch() {
        const idEl = document.getElementById('search-query');
        const nameEl = document.getElementById('search-name'); // 備品名入力を追加してる前提

        const idQuery = idEl ? idEl.value.trim() : '';
        const nameQuery = nameEl ? nameEl.value.trim() : '';

        if (!idQuery && !nameQuery) {
            alert('備品番号か備品名を入力してください');
            return;
        }

        let assets;
        try {
            assets = await loadJoinedAssetsOnce();
        } catch {
            // loadJoinedAssetsOnce 内で alert 済み
            return;
        }

        // 1) 管理番号で完全一致検索（OFS-2025...）
        if (idQuery) {
            let found = null;

            for (let i = 0; i < assets.length; i++) {
                const a = assets[i];
                const idCandidate =
                    a.management_number ||
                    a.asset_number ||
                    a.id ||
                    a.asset_id;

                if (idCandidate && String(idCandidate) === idQuery) {
                    found = a;
                    break;
                }
            }

            if (found) {
                searchState.result = found;
                Router.to('search-result');
                return;
            }

            if (!nameQuery) {
                alert('該当する備品が見つかりません');
                return;
            }
            // 名前も入っているときはこのまま名前検索にフォールバック
        }

        // 2) 備品名（部分一致）検索
        if (nameQuery) {
            const qNorm = normalize(nameQuery);
            const matches = [];

            for (let i = 0; i < assets.length; i++) {
                const a = assets[i];
                const nameNorm = normalize(a.name);
                if (nameNorm && nameNorm.indexOf(qNorm) !== -1) {
                    matches.push(a);
                }
            }

            if (matches.length === 0) {
                alert('該当する備品が見つかりません');
                return;
            }

            if (matches.length === 1) {
                searchState.result = matches[0];
                Router.to('search-result');
                return;
            }

            // 複数ヒットしたときは一覧だけ出して番号指定で絞ってもらう
            let msg = '該当する備品が複数あります。\n\n';
            for (let i = 0; i < matches.length; i++) {
                const a = matches[i];
                const idLabel =
                    a.management_number ||
                    a.asset_number ||
                    a.id ||
                    a.asset_id ||
                    '(ID不明)';
                const nameLabel = a.name || '';
                msg += '- ' + idLabel + ' : ' + nameLabel + '\n';
            }
            msg += '\n備品番号を指定して再検索してください。';
            alert(msg);
        }
    },

    backToSearch() {
        searchState.result = null;
        Router.to('search-top');
    }
};


// ==== 画面初期化（routerから呼ばれる想定） ====
export function initSearch(view) {
    if (view !== 'result') {
        return;
    }

    const data = searchState.result;
    if (!data) {
        alert('不正な遷移です');
        Router.to('search-top');
        return;
    }

    setInputValue('disp-name', data.name);
    setInputValue('disp-maker', data.manufacturer);
    setInputValue('disp-model', data.model);
    setInputValue('disp-serial', data.serial);
    setInputValue('disp-genre', data.genre_name);
    setInputValue('disp-location',
        data.default_location || data.location || data.owner
    );
    setInputValue('disp-date',
        data.purchased_at || data.purchase_date
    );
    setInputValue('disp-registrant',
        data.owner || data.registrant
    );
    setInputValue('disp-remarks',
        data.remarks || data.description
    );
}

// ==== 小さなユーティリティ ====
function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    if (value === null || value === undefined || value === '') {
        el.value = '-';
    } else {
        el.value = String(value);
    }
}
