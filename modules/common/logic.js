import { Router } from '../../js/router.js';

function createDefaultCompleteState() {
    return {
        message: '処理が完了しました',
        note: '',
        autoRedirectSeconds: 5,
        autoRedirectRouteKey: 'main-menu',
        autoRedirectLabel: 'メニューへ戻ります',
        actions: [
            {
                label: 'メニューへ戻る',
                routeKey: 'main-menu',
                style: 'primary-btn',
                clearHistory: true
            }
        ],
        timerId: null
    };
}

const commonState = createDefaultCompleteState();

function applyCompleteState(options = {}) {
    const defaults = createDefaultCompleteState();
    commonState.message = options.message || defaults.message;
    commonState.note = options.note || '';
    commonState.autoRedirectSeconds = options.autoRedirectSeconds ?? defaults.autoRedirectSeconds;
    commonState.autoRedirectRouteKey = options.autoRedirectRouteKey || defaults.autoRedirectRouteKey;
    commonState.autoRedirectLabel = options.autoRedirectLabel || defaults.autoRedirectLabel;
    commonState.actions = Array.isArray(options.actions) && options.actions.length > 0
        ? options.actions
        : defaults.actions;
}

window.CommonController = {
    /**
     * 完了画面を表示して、その後メインメニューへ戻る
     * @param {string|object} options - 表示設定
     */
    showComplete(options) {
        if (typeof options === 'string') {
            applyCompleteState({ message: options });
        } else {
            applyCompleteState(options || {});
        }

        return Router.to('complete');
    },

    runAction(index = 0) {
        if (commonState.timerId) {
            clearInterval(commonState.timerId);
        }

        const action = commonState.actions[index] || commonState.actions[0];
        if (!action?.routeKey) {
            Router.to('main-menu', {
                replaceCurrent: true,
                clearHistory: true
            });
            return;
        }

        Router.to(action.routeKey, {
            replaceCurrent: true,
            clearHistory: action.clearHistory !== false
        });
    },

    forceBack() {
        this.runAction(0);
    }
};

/**
 * 完了画面の初期化処理 (Routerから呼ばれる)
 */
export function initComplete() {
    const msgEl = document.getElementById('complete-message');
    const noteEl = document.getElementById('complete-note');
    const actionsEl = document.getElementById('complete-actions');

    if (msgEl) {
        msgEl.textContent = commonState.message;
    }

    if (actionsEl) {
        actionsEl.innerHTML = commonState.actions.map((action, index) => {
            const styleClass = action.style || (index === 0 ? 'primary-btn' : 'back-btn');
            return `
                <button class="${styleClass}" onclick="CommonController.runAction(${index})">
                    ${action.label}
                </button>
            `;
        }).join('');
    }

    if (commonState.timerId) {
        clearInterval(commonState.timerId);
    }

    if (!noteEl) {
        return;
    }

    if (!commonState.autoRedirectSeconds || commonState.autoRedirectSeconds <= 0 || !commonState.autoRedirectRouteKey) {
        noteEl.hidden = commonState.note === '';
        noteEl.textContent = commonState.note;
        return;
    }

    noteEl.hidden = false;
    let timeLeft = commonState.autoRedirectSeconds;

    const renderCountdown = () => {
        const countdownText = `${timeLeft} 秒後に${commonState.autoRedirectLabel}...`;
        noteEl.textContent = commonState.note
            ? `${commonState.note}\n${countdownText}`
            : countdownText;
    };

    renderCountdown();

    commonState.timerId = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft <= 0) {
            clearInterval(commonState.timerId);
            Router.to(commonState.autoRedirectRouteKey, {
                replaceCurrent: true,
                clearHistory: true
            });
            return;
        }

        renderCountdown();
    }, 1000);
}
