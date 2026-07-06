import { getAdminToken, getComputerAccessGranted } from './token.js';

const loadRegistrationModule = () => import('../modules/registration/logic.js');
const loadDisposalModule = () => import('../modules/disposal/logic.js');
const loadItemListModule = () => import('../modules/item_list/logic.js');
const loadLendReturnModule = () => import('../modules/lend_return/logic.js');
const loadSearchModule = () => import('../modules/search/logic.js');
const loadCommonModule = () => import('../modules/common/logic.js');
const loadAdminModule = () => import('../modules/admin/logic.js');
const loadMainMenuModule = () => import('../modules/main/logic.js');
const loadComputersModule = () => import('../modules/computers/logic.js');

// ルート定義: 画面IDとファイルパス、初期化処理の紐付け
const routes = {
    'main-menu': {
        path: 'modules/main/menu.html',
        title: 'メインメニュー',
        loader: loadMainMenuModule,
        init: (module) => module.initMainMenu()
    },

    // === 新規登録 ===
    'reg-select': { path: 'modules/registration/step1.html', title: '新規登録', loader: loadRegistrationModule },
    'reg-batch-select': {
        path: 'modules/registration/batchSelect.html',
        title: '新規登録 > 管理方法選択 > まとめて登録',
        loader: loadRegistrationModule
    },
    'reg-batch-simple': {
        path: 'modules/registration/batchSimple.html',
        title: '新規登録 > 管理方法選択 > まとめて登録 > かんたん入力',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('batch-simple');
        }
    },
    'reg-batch-table': {
        path: 'modules/registration/batchTable.html',
        title: '新規登録 > 管理方法選択 > まとめて登録 > 表形式で入力',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('batch-table');
        }
    },
    'reg-batch': {
        path: 'modules/registration/batchReg.html',
        title: '新規登録 > 管理方法選択 > まとめて登録 > CSVファイルから登録',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('batch');
        }
    },
    'reg-input-1': {
        path: 'modules/registration/step2.html',
        title: '新規登録 > 管理方法選択 > 入力①',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('step1');
        }
    },
    'reg-input-2': {
        path: 'modules/registration/step3.html',
        title: '新規登録 > 管理方法選択 > 入力②',
        loader: loadRegistrationModule,
        init: async (module) => {
            await module.initRegistration('step3');
        }
    },

    'reg-confirm': {
        path: 'modules/registration/confirm.html',
        title: '新規登録 > 内容確認',
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
    'lend-input': {
        path: 'modules/lend_return/lend_input.html',
        title: '貸出登録',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('lend-input')
    },
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
    'return-search': {
        path: 'modules/lend_return/return_search.html',
        title: '返却対象検索',
        loader: loadLendReturnModule,
        init: (module) => module.initLendReturn('return-search')
    },
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
        loader: loadSearchModule,
        init: (module) => module.initSearch('input')
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

    // === 計算機管理 ===
    'computer-login': {
        path: 'modules/computers/login.html',
        title: '計算機管理ログイン',
        loader: loadComputersModule,
        init: (module) => module.initComputers('login')
    },
    'computer-main': {
        path: 'modules/computers/main_menu.html',
        title: '計算機管理',
        requiresComputerAccess: true,
        loader: loadComputersModule,
        init: (module) => module.initComputers('main')
    },
    'computer-details': {
        path: 'modules/computers/details.html',
        title: '計算機詳細管理',
        requiresComputerAccess: true,
        loader: loadComputersModule,
        init: (module) => module.initComputers('details')
    },
    'computer-parts': {
        path: 'modules/computers/parts.html',
        title: '計算機部品管理',
        requiresComputerAccess: true,
        loader: loadComputersModule,
        init: (module) => module.initComputers('parts')
    },
    'computer-configurations': {
        path: 'modules/computers/configurations.html',
        title: '計算機構成履歴管理',
        requiresComputerAccess: true,
        loader: loadComputersModule,
        init: (module) => module.initComputers('configurations')
    },

    // === 管理者機能 ===
    'admin-login': {
        path: 'modules/admin/login.html',
        title: '管理者ログイン',
        loader: loadAdminModule,
        init: (module) => module.initAdmin('login')
    },
    'admin-main': {
        path: 'modules/admin/main_menu.html',
        title: '管理者メニュー',
        requiresAuth: true,
        loader: loadAdminModule,
        init: (module) => module.initAdmin('main')
    },
    'admin-register': {
        path: 'modules/admin/register.html',
        title: '管理者追加登録',
        requiresAuth: true,
        loader: loadAdminModule,
        init: (module) => module.initAdmin('register')
    },
    'admin-genres': {
        path: 'modules/admin/genre_list.html', title: '備品ジャンル管理',
        requiresAuth: true,
        loader: loadAdminModule,
        init: (module) => module.initAdmin('genres')
    },

};

export const Router = {
    _navigationSeq: 0,
    _templateCache: new Map(),
    _historyStack: [],
    _currentRouteKey: '',
    _baseTitle: document.title || '備品管理システム',

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
    async to(routeKey, options = {}) {
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
        } else if (route.requiresComputerAccess) {
            const granted = getComputerAccessGranted();
            if (!granted) {
                resolvedRouteKey = 'computer-login';
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

            if (options.clearHistory) {
                this._historyStack = [];
            }

            if (
                !options.skipHistory
                && !options.replaceCurrent
                && this._currentRouteKey
                && this._currentRouteKey !== resolvedRouteKey
            ) {
                if (this._historyStack[this._historyStack.length - 1] !== this._currentRouteKey) {
                    this._historyStack.push(this._currentRouteKey);
                }
            }

            this._currentRouteKey = resolvedRouteKey;

            document.title = route.title
                ? `${route.title} | ${this._baseTitle}`
                : this._baseTitle;

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

    back(fallbackRouteKey = 'main-menu') {
        const previousRouteKey = this._historyStack.pop();
        if (previousRouteKey) {
            this.to(previousRouteKey, {
                skipHistory: true,
                replaceCurrent: true
            });
            return;
        }

        this.to(fallbackRouteKey, {
            skipHistory: true,
            replaceCurrent: true
        });
    }
};

// HTML内の onclick="Router.to(...)" を動くようにグローバル公開
window.Router = Router;
