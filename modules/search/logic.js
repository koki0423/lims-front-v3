import { Router } from '../../js/router.js';

// === 状態管理 ===
const searchState = {
    result: null // 検索でヒットしたデータ
};

// === 検索用モックデータ ===
const mockDb = [
    {
        id: 'OFS-20251101-0001',
        name: 'MacBook Air M2',
        maker: 'Apple',
        model: 'MLXW3J/A',
        serial: 'W8009JEE5PC',
        genre: '個人',
        location: '実験室A',
        purchaseDate: '2025-04-01',
        registrant: 'AB12345',
        remarks: '研究用メイン機'
    },
    {
        id: 'OFS-20251101-0002',
        name: 'デジタルオシロスコープ',
        maker: 'Tektronix',
        model: 'TBS1052B',
        serial: 'TEK-99999',
        genre: '高度情報演習',
        location: '機材倉庫',
        purchaseDate: '2024-10-15',
        registrant: 'TEACHER01',
        remarks: '共用備品'
    }
];

window.SearchController = {
    // 検索実行
    performSearch() {
        const query = document.getElementById('search-query').value;
        if (!query) {
            alert('備品番号を入力してください');
            return;
        }

        // 完全一致で検索
        const hit = mockDb.find(item => item.id === query);

        if (hit) {
            searchState.result = hit;
            console.log('Search Hit:', hit);
            Router.to('search-result');
        } else {
            alert('該当する備品が見つかりません。\n(デモ用: OFS-20251101-0001 で試してください)');
        }
    },

    // 検索トップに戻る
    backToSearch() {
        searchState.result = null;
        Router.to('search-top');
    }
};

// === 画面初期化 ===
export function initSearch(view) {
    if (view === 'result') {
        const data = searchState.result;
        
        // データがない状態で直接アクセスされた場合
        if (!data) {
            alert('不正な遷移です');
            Router.to('search-top');
            return;
        }

        // 各フィールドに値をセット
        setValue('disp-name', data.name);
        setValue('disp-maker', data.maker);
        setValue('disp-model', data.model);
        setValue('disp-serial', data.serial);
        setValue('disp-genre', data.genre);
        setValue('disp-location', data.location);
        setValue('disp-date', data.purchaseDate);
        setValue('disp-registrant', data.registrant);
        setValue('disp-remarks', data.remarks);
    }
}

// ヘルパー関数
function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '-';
}