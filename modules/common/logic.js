import { Router } from '../../js/router.js';

// 完了画面の状態管理
const commonState = {
    message: '処理が完了しました',
    timerId: null
};

window.CommonController = {
    /**
     * 完了画面を表示して、その後メインメニューへ戻る
     * @param {string} msg - 表示したいメッセージ (例: "登録が完了しました")
     */
    showComplete(msg) {
        commonState.message = msg || '処理が完了しました';
        Router.to('complete');
    },

    // 手動で戻るボタンを押したとき用
    forceBack() {
        if (commonState.timerId) clearTimeout(commonState.timerId);
        Router.to('main-menu');
    }
};

/**
 * 完了画面の初期化処理 (Routerから呼ばれる)
 */
export function initComplete() {
    // 1. メッセージの表示
    const msgEl = document.getElementById('complete-message');
    if (msgEl) {
        msgEl.textContent = commonState.message;
    }

    // 2. カウントダウンと自動遷移
    const countdownEl = document.getElementById('countdown');
    let timeLeft = 5; // 5秒

    // 前回のタイマーが残っていたらクリア
    if (commonState.timerId) clearInterval(commonState.timerId);

    // 1秒ごとにカウントダウン更新
    commonState.timerId = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(commonState.timerId);
            Router.to('main-menu');
        }
    }, 1000);
}