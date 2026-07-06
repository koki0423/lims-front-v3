import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';
import { setAdminToken, clearAdminToken } from '../../js/token.js';
import { confirmAction } from '../../js/ui_dialog.js';
import { runWithButtonLoading, setControlsDisabled } from '../../js/ui_loading.js';
import { hidePageFeedback, showApiPageFeedback, showPageFeedback } from '../../js/ui_feedback.js';

const adminState = {
    genres: [],
    flash: null,
    genreLoading: false
};

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
}

function getActiveAdminFeedbackId() {
    return [
        'admin-login-feedback',
        'admin-main-feedback',
        'admin-register-feedback',
        'admin-genres-feedback'
    ].find((id) => document.getElementById(id)) || '';
}

function clearActiveAdminFeedback() {
    const feedbackId = getActiveAdminFeedbackId();
    if (feedbackId) {
        hidePageFeedback(feedbackId);
    }
}

function showActiveAdminFeedback(message, tone = 'error') {
    const feedbackId = getActiveAdminFeedbackId();
    if (feedbackId) {
        showPageFeedback(feedbackId, message, tone);
    }
}

function setAdminFlash(view, message, tone = 'success') {
    adminState.flash = {
        view,
        message,
        tone
    };
}

function consumeAdminFlash(view, feedbackId) {
    hidePageFeedback(feedbackId);

    if (!adminState.flash || adminState.flash.view !== view) {
        return;
    }

    showPageFeedback(feedbackId, adminState.flash.message, adminState.flash.tone);
    adminState.flash = null;
}

function setGenreControlsLoading(isLoading) {
    setControlsDisabled([
        '#new-genre-name',
        '#new-genre-code',
        '#admin-genre-add-btn',
        '#genre-list-body .sm-btn',
        '#admin-genres-back-btn'
    ], isLoading);
}

window.AdminController = {
    // ===============================================
    // ログイン・管理者登録関連
    // ===============================================
    async NfcRead() {
        const input = document.getElementById('admin-id');

        try {
            const { scanStudentIdWithRetry } = await loadNfcReader();
            const result = await scanStudentIdWithRetry(9, 2000);

            if (result.ok) {
                input.value = result.studentId;
                clearActiveAdminFeedback();
                return;
            }

            if (!result.cancelled) {
                showActiveAdminFeedback('NFC読み取り失敗: ' + result.error, 'error');
            }
        } catch (err) {
            console.error("scan error:", err);
            showActiveAdminFeedback(
                'NFC読み取り中にエラーが発生しました: ' + (err instanceof Error ? err.message : String(err)),
                'error'
            );
        }
    },

    async login() {
        const form = document.getElementById('form-admin-login');
        const idInput = document.getElementById('admin-id');
        const passInput = document.getElementById('admin-pass');
        if (!form || !idInput || !passInput) {
            return;
        }

        hidePageFeedback('admin-login-feedback');
        if (!form.reportValidity()) {
            showPageFeedback('admin-login-feedback', '入力内容を確認してください。', 'error');
            return;
        }

        const controls = [
            '#admin-id',
            '#admin-pass',
            '#admin-login-back-btn',
            '#form-admin-login .nfc-btn'
        ];

        setControlsDisabled(controls, true);
        try {
            await runWithButtonLoading('#admin-login-btn', { busyText: 'ログイン中...' }, async () => {
                const data = await API.admin.login({ id: idInput.value, password: passInput.value });
                if (!data || !data.token) {
                    showPageFeedback('admin-login-feedback', 'ログイン応答が不正です。', 'error');
                    return;
                }

                setAdminToken(data.token);
                Router.to('admin-main');
            });
        } catch (error) {
            showApiPageFeedback('admin-login-feedback', error, 'ログインに失敗しました。');
        } finally {
            setControlsDisabled(controls, false);
        }
    },

    async logout() {
        const confirmed = await confirmAction({
            title: 'ログアウト確認',
            message: '管理者メニューからログアウトしますか？',
            confirmLabel: 'ログアウト',
            cancelLabel: 'キャンセル',
            tone: 'warning'
        });

        if (!confirmed) {
            return;
        }

        clearAdminToken();
        Router.to('main-menu');
    },

    toRegister() {
        Router.to('admin-register');
    },

    showMasterEditNotice() {
        showPageFeedback('admin-main-feedback', 'マスタ編集は未実装です。必要に応じて機能追加します。', 'info');
    },

    async submitRegister() {
        const form = document.getElementById('form-admin-reg');
        if (!form) {
            return;
        }

        hidePageFeedback('admin-register-feedback');
        if (!form.reportValidity()) {
            showPageFeedback('admin-register-feedback', '入力に不備があります。必須項目を入力してください。', 'error');
            return;
        }

        const id = document.getElementById('admin-id').value;
        const password = new FormData(form).get('password');
        const controls = [
            '#admin-id',
            '#form-admin-reg input[name="password"]',
            '#form-admin-reg .nfc-btn',
            '#admin-register-back-btn'
        ];

        setControlsDisabled(controls, true);
        try {
            await runWithButtonLoading('#admin-register-submit-btn', { busyText: '登録中...' }, async () => {
                await API.admin.register({ id, password, role: "admin" });
                setAdminFlash('main', '管理者を追加登録しました。', 'success');
                Router.to('admin-main');
            });
        } catch (error) {
            if (error?.response?.status === 409) {
                showPageFeedback('admin-register-feedback', 'そのIDは既に存在します。', 'warning');
                return;
            }

            showApiPageFeedback('admin-register-feedback', error, '登録に失敗しました。');
        } finally {
            setControlsDisabled(controls, false);
        }
    },

    submitRegisterWithAlert() {
        return this.submitRegister();
    },

    // ===============================================
    // 備品ジャンル管理
    // ===============================================
    async initGenreMaster() {
        await this.initAdmin('genres');
    },

    async initAdmin(view) {
        if (view === 'login') {
            consumeAdminFlash('login', 'admin-login-feedback');
            return;
        }

        if (view === 'main') {
            consumeAdminFlash('main', 'admin-main-feedback');
            return;
        }

        if (view === 'register') {
            consumeAdminFlash('register', 'admin-register-feedback');
            return;
        }

        if (view === 'genres') {
            consumeAdminFlash('genres', 'admin-genres-feedback');
            await this.renderGenreList();
        }
    },

    async renderGenreList() {
        const tbody = document.getElementById('genre-list-body');
        if (!tbody) {
            return;
        }

        adminState.genreLoading = true;
        setGenreControlsLoading(true);
        try {
            const genres = await AppState.loadGenres({ all: true, force: true });
            adminState.genres = genres;

            tbody.innerHTML = genres.map((genre, index) => {
                const rowClass = genre.is_disabled ? ' class="admin-genre-row--disabled"' : '';
                const statusText = genre.is_disabled ? '無効' : '有効';
                const btnText = genre.is_disabled ? '有効化' : '無効化';

                return `
                    <tr${rowClass}>
                        <td>${escapeHtml(genre.id)}</td>
                        <td>${escapeHtml(genre.name)}</td>
                        <td>${escapeHtml(genre.code)}</td>
                        <td>${statusText}</td>
                        <td>
                            <button class="sm-btn" onclick="AdminController.toggleGenreByIndex(${index})">
                                ${btnText}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty-state table-empty-state-error">ジャンル一覧の取得に失敗しました</td></tr>';
            showApiPageFeedback('admin-genres-feedback', error, 'ジャンル一覧の取得に失敗しました。');
        } finally {
            adminState.genreLoading = false;
            setGenreControlsLoading(false);
        }
    },

    async addGenre() {
        if (adminState.genreLoading) {
            return;
        }

        const name = document.getElementById('new-genre-name').value.trim();
        const code = document.getElementById('new-genre-code').value.trim();

        hidePageFeedback('admin-genres-feedback');
        if (!name || !code) {
            showPageFeedback('admin-genres-feedback', 'ジャンル名とコードを入力してください。', 'error');
            return;
        }

        adminState.genreLoading = true;
        setGenreControlsLoading(true);
        try {
            await runWithButtonLoading('#admin-genre-add-btn', { busyText: '追加中...' }, async () => {
                await API.genres.create({ name, code });
            });

            await AppState.refreshGenres();
            await this.renderGenreList();

            document.getElementById('new-genre-name').value = '';
            document.getElementById('new-genre-code').value = '';
            showPageFeedback('admin-genres-feedback', 'ジャンルを追加しました。', 'success');
        } catch (error) {
            console.error(error);
            showApiPageFeedback('admin-genres-feedback', error, 'ジャンルの追加に失敗しました。');
        } finally {
            adminState.genreLoading = false;
            setGenreControlsLoading(false);
        }
    },

    async toggleGenre(id, nextIsDisabledState, name, code) {
        const action = nextIsDisabledState ? '無効化' : '有効化';
        if (adminState.genreLoading) {
            return;
        }

        const confirmed = await confirmAction({
            title: 'ジャンル状態変更',
            message: `${name} を${action}しますか？`,
            confirmLabel: action,
            cancelLabel: 'キャンセル',
            tone: nextIsDisabledState ? 'warning' : 'primary'
        });
        if (!confirmed) {
            return;
        }

        hidePageFeedback('admin-genres-feedback');
        adminState.genreLoading = true;
        setGenreControlsLoading(true);
        try {
            await API.genres.update(id, {
                name,
                code,
                is_disabled: nextIsDisabledState
            });

            await AppState.refreshGenres();
            await this.renderGenreList();
            showPageFeedback('admin-genres-feedback', `${name} を${action}しました。`, 'success');
        } catch (error) {
            showApiPageFeedback('admin-genres-feedback', error, 'ジャンルの更新に失敗しました。');
        } finally {
            adminState.genreLoading = false;
            setGenreControlsLoading(false);
        }
    },

    async toggleGenreByIndex(index) {
        const genre = adminState.genres[index];
        if (!genre) {
            showPageFeedback('admin-genres-feedback', '対象ジャンルが見つかりません。', 'error');
            return;
        }

        await this.toggleGenre(genre.id, !genre.is_disabled, genre.name, genre.code);
    }
};

export function initAdmin(view) {
    return window.AdminController.initAdmin(view);
}
