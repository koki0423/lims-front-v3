import { getAdminToken } from './token.js';

const loadRegistrationModule = () => import('../modules/registration/logic.js');
const loadDisposalModule = () => import('../modules/disposal/logic.js');
const loadItemListModule = () => import('../modules/item_list/logic.js');
const loadLendReturnModule = () => import('../modules/lend_return/logic.js');
const loadSearchModule = () => import('../modules/search/logic.js');
const loadCommonModule = () => import('../modules/common/logic.js');
const loadAdminModule = () => import('../modules/admin/logic.js');

// ルート定義: 画面IDとファイルパス、初期化処理の紐付け
const routes = {
    'main-menu': { path: 'modules/main/menu.html', title: 'メインメニュー' },

    // === 新規登録 ===
    'reg-select': { path: 'modules/registration/step1.html', title: '新規登録', loader: loadRegistrationModule },
    'reg-batch': { path: 'modules/registration/batchReg.html', title: '新規登録 > 管理方法選択 > 一括登録', loader: loadRegistrationModule },
    'reg-input-1': {
        path: 'modules/registration/step2.html',
        title: '新規登録 > 基本',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('step1');
        }
    },
    'reg-input-2': {
        path: 'modules/registration/step3.html',
        title: '新規登録 > 詳細',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('step3');
        }
    },

    'reg-confirm': {
        path: 'modules/registration/confirm.html',
        title: '新規登録 > 確認',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('confirm');
        }
    },

    // === 廃棄 ===
    'disposal-top': { path: 'modules/disposal/top.html', title: '廃棄メニュー' },
    'disposal-input': {
        path: 'modules/disposal/input.html',
        title: '廃棄登録',
        loader: loadDisposalModule,
        init: (module) => module.initDisposal('input')
    },
    'disposal-confirm': {
        path: 'modules/disposal/confirm.html',
        title: '廃棄確認',
        loader: loadDisposalModule,
        init: (module) => module.initDisposal('confirm')
    },
    'disposal-history': {
        path: 'modules/disposal/history.html',
        title: '廃棄履歴',
        loader: loadDisposalModule,
        init: (module) => module.initDisposal('history')
    },

    // === 備品参照 ===
    'item-list': {
        path: 'modules/item_list/list.html',
        title: '備品一覧',
        loader: loadItemListModule,
        init: (module) => module.initItemList()
    },

    // === 貸出・返却 ===
    'lend-return-top': { path: 'modules/lend_return/top.html', title: '貸出・返却' },

    // 貸出フロー
    'lend-menu': { path: 'modules/lend_return/lend_menu.html', title: '貸出メニュー' },
    'lend-history': {
        path: 'modules/lend_return/lend_history.html',
        title: '貸出履歴',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('lend-history')
    },
    'lend-input': { path: 'modules/lend_return/lend_input.html', title: '貸出登録', loader: loadLendReturnModule },
    'lend-confirm': {
        path: 'modules/lend_return/lend_confirm.html',
        title: '貸出確認',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('lend-confirm')
    },

    // 返却フロー
    'return-menu': { path: 'modules/lend_return/return_menu.html', title: '返却メニュー' },
    'return-history': {
        path: 'modules/lend_return/return_history.html',
        title: '返却履歴',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('return-history')
    },
    'return-search': { path: 'modules/lend_return/return_search.html', title: '返却対象検索', loader: loadLendReturnModule },
    'return-select': {
        path: 'modules/lend_return/return_select.html',
        title: '返却対象選択',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('return-select')
    },
    'return-input': {
        path: 'modules/lend_return/return_input.html',
        title: '返却登録',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('return-input')
    },
    'return-confirm': {
        path: 'modules/lend_return/return_confirm.html',
        title: '返却確認',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('return-confirm')
    },

    // === 検索 ===
    'search-top': {
        path: 'modules/search/input.html',
        title: '備品検索',
        loader: loadSearchModule
    },
    'search-result': {
        path: 'modules/search/result.html',
        title: '検索結果',
        loader: loadSearchModule,
        init: (module) => module.initSearch('result')
    },
    'search-list': {
        path: 'modules/search/list.html',
        title: '検索結果一覧',
        loader: loadSearchModule,
        init: (module) => module.initSearchList()
    },

    // === 共通完了画面 ===
    'complete': {
        path: 'modules/common/complete.html',
        title: '完了',
        loader: loadCommonModule,
        init: (module) => module.initComplete()
    },

    // === 管理者機能 ===
    'admin-login': { path: 'modules/admin/login.html', title: '管理者ログイン', loader: loadAdminModule },
    'admin-main': { path: 'modules/admin/main_menu.html', title: '管理者メニュー', requiresAuth: true, loader: loadAdminModule },
    'admin-register': { path: 'modules/admin/register.html', title: '管理者追加登録', requiresAuth: true, loader: loadAdminModule },
    'admin-genres': {
        path: 'modules/admin/genre_list.html', title: '備品ジャンル管理',
        requiresAuth: true,
        loader: loadAdminModule,
        init: () => window.AdminController.initGenreMaster()
    },

};

export const Router = {
    _navigationSeq: 0,
    _templateCache: new Map(),

    async _loadTemplate(path) {
        if (this._templateCache.has(path)) {
            return this._templateCache.get(path);
        }

        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${path} (${response.status})`);
        }

        const html = await response.text();
        this._templateCache.set(path, html);
        return html;
    },

    // 画面遷移処理
    async to(routeKey) {
        let resolvedRouteKey = routeKey;
        let route = routes[resolvedRouteKey];

        if (!route) {
            console.error('Route not found:', routeKey);
            return;
        }

        if (route.requiresAuth) {
            const token = getAdminToken();
            if (!token) {
                resolvedRouteKey = 'admin-login';
                route = routes[resolvedRouteKey];
            }
        }

        try {
            const navigationId = ++this._navigationSeq;
            const container = document.getElementById('app-container');
            if (!container) {
                throw new Error('App container not found');
            }

            const modulePromise = route.loader ? route.loader() : Promise.resolve(null);
            const [html, loadedModule] = await Promise.all([
                this._loadTemplate(route.path),
                modulePromise
            ]);

            if (navigationId !== this._navigationSeq) {
                return;
            }

            // コンテナに注入
            container.innerHTML = html; // DOM更新

            // アニメーション用クラス付与
            container.classList.remove('fade-in');
            void container.offsetWidth; // リフロー発生
            container.classList.add('fade-in');

            // タイトル更新（必要であれば）
            // document.title = route.title; 

            // 特定の初期化処理があれば実行
            if (route.init) {
                await route.init(loadedModule);

                if (navigationId !== this._navigationSeq) {
                    return;
                }
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
