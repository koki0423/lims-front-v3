import { initRegistration } from '../modules/registration/logic.js';
import { initDisposal } from '../modules/disposal/logic.js';
import { initItemList } from '../modules/item_list/logic.js';
import { initLendReturn } from '../modules/lend_return/logic.js';
import { initSearch } from '../modules/search/logic.js';
import { initComplete } from '../modules/common/logic.js';
import '../modules/admin/logic.js';

// ルート定義: 画面IDとファイルパス、初期化処理の紐付け
const routes = {
    'main-menu': { path: 'modules/main/menu.html', title: 'メインメニュー' },

    // === 新規登録 ===
    'reg-select': { path: 'modules/registration/step1.html', title: '新規登録' },
    'reg-input-1': { path: 'modules/registration/step2.html', title: '新規登録 > 基本', init: () => initRegistration('step2') },
    'reg-input-2': { path: 'modules/registration/step3.html', title: '新規登録 > 詳細', init: () => initRegistration('step3') },
    'reg-confirm': { path: 'modules/registration/confirm.html', title: '新規登録 > 確認', init: () => initRegistration('confirm') },

    // === 廃棄 ===
    'disposal-top': { path: 'modules/disposal/top.html', title: '廃棄メニュー' },
    'disposal-input': { path: 'modules/disposal/input.html', title: '廃棄登録', init: () => initDisposal('input') },
    'disposal-confirm': { path: 'modules/disposal/confirm.html', title: '廃棄確認', init: () => initDisposal('confirm') },
    'disposal-history': { path: 'modules/disposal/history.html', title: '廃棄履歴', init: () => initDisposal('history') },

    // === 備品参照 (新規追加) ===
    'item-list': { path: 'modules/item_list/list.html', title: '備品一覧', init: () => initItemList() },

    // === 貸出・返却 ===
    'lend-return-top': { path: 'modules/lend_return/top.html', title: '貸出・返却' },

    // 貸出フロー
    'lend-menu': { path: 'modules/lend_return/lend_menu.html', title: '貸出メニュー' },
    'lend-history': { path: 'modules/lend_return/lend_history.html', title: '貸出履歴', init: () => initLendReturn('lend-history') },
    'lend-input': { path: 'modules/lend_return/lend_input.html', title: '貸出登録' },
    'lend-confirm': {
        path: 'modules/lend_return/lend_confirm.html',
        title: '貸出確認',
        init: () => initLendReturn('lend-confirm') // 初期化フック
    },

    // 返却フロー
    'return-menu': { path: 'modules/lend_return/return_menu.html', title: '返却メニュー' },
    'return-history': { path: 'modules/lend_return/return_history.html', title: '返却履歴', init: () => initLendReturn('return-history') },
    'return-search': { path: 'modules/lend_return/return_search.html', title: '返却対象検索' },
    'return-input': {
        path: 'modules/lend_return/return_input.html',
        title: '返却登録',
        init: () => initLendReturn('return-input') // 検索結果を引数に初期化
    },
    'return-confirm': {
        path: 'modules/lend_return/return_confirm.html',
        title: '返却確認',
        init: () => initLendReturn('return-confirm')
    },

    // === 検索 ===
    'search-top': {
        path: 'modules/search/input.html',
        title: '備品検索'
    },
    'search-result': {
        path: 'modules/search/result.html',
        title: '検索結果',
        init: () => initSearch('result') // データ表示処理
    },

    // === 共通完了画面 ===
    'complete': {
        path: 'modules/common/complete.html',
        title: '完了',
        init: () => initComplete()
    },

    // === 管理者機能 ===
    'admin-login':    { path: 'modules/admin/login.html',     title: '管理者ログイン' },
    'admin-main':     { path: 'modules/admin/main_menu.html', title: '管理者メニュー' },
    'admin-register': { path: 'modules/admin/register.html',  title: '管理者追加登録' },

};

export const Router = {
    // 画面遷移処理
    async to(routeKey) {
        const route = routes[routeKey];
        if (!route) {
            console.error('Route not found:', routeKey);
            return;
        }

        try {
            // HTMLをフェッチ
            const response = await fetch(route.path);
            const html = await response.text();

            // コンテナに注入
            const container = document.getElementById('app-container');
            container.innerHTML = html; // DOM更新

            // アニメーション用クラス付与
            container.classList.remove('fade-in');
            void container.offsetWidth; // リフロー発生
            container.classList.add('fade-in');

            // タイトル更新（必要であれば）
            // document.title = route.title; 

            // 特定の初期化処理があれば実行
            if (route.init) {
                route.init();
            }

            // スクロールリセット
            window.scrollTo(0, 0);

        } catch (e) {
            console.error('Failed to load page:', e);
        }
    },

    back() {
        // 簡易実装: メインに戻る（本来は履歴スタック管理推奨）
        this.to('main-menu');
    }
};

// HTML内の onclick="Router.to(...)" を動くようにグローバル公開
window.Router = Router;