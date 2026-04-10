import { Router } from './router.js';
import { AppState } from './app_state.js';

// DOM読み込み完了時に一連の初期化を行う
document.addEventListener('DOMContentLoaded', () => {
    AppState.initMasterData().catch((error) => {
        console.error('Initial master data preload failed:', error);
    });

    // 途中で初期化処理が必要な場合はここに追加し，最後にRouter.toを呼ぶこと
    Router.to('main-menu');
});
