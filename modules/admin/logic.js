import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { escapeHtml } from '../../js/dom_utils.js';
import { setAdminToken, clearAdminToken } from '../../js/token.js';

const adminState = {
    genres: []
};

async function loadNfcReader() {
    return import('../../js/nfcReader.js');
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
                return;
            }

            if (!result.cancelled) {
                alert('NFC読み取り失敗: ' + result.error);
            }
        } catch (err) {
            console.error("scan error:", err);
            alert('NFC読み取り中にエラーが発生しました: ' + (err instanceof Error ? err.message : String(err)));
        }
    },

    async login() {
        const id = document.getElementById('admin-id').value;
        const pass = document.getElementById('admin-pass').value;
        const errorMsg = document.getElementById('login-error-msg');
        if (errorMsg) errorMsg.textContent = '';

        try {
            const data = await API.admin.login({ id, password: pass });
            if (!data || !data.token) {
                if (errorMsg) errorMsg.textContent = 'ログイン応答が不正です';
                return;
            }

            setAdminToken(data.token);
            Router.to('admin-main');
        } catch (error) {
            if (errorMsg) errorMsg.textContent = 'ログインに失敗しました。';
        }
    },

    logout() {
        clearAdminToken();
        alert('ログアウトしました');
        Router.to('main-menu');
    },

    toRegister() {
        Router.to('admin-register');
    },

    async submitRegister() {
        const form = document.getElementById('form-admin-reg');
        const errorMsg = document.getElementById('register-error-msg');
        if (errorMsg) errorMsg.textContent = '';

        if (!form.reportValidity()) {
            if (errorMsg) {
                errorMsg.textContent = '入力に不備があります。必須項目を入力してください。';
            }
            return;
        }

        const id = document.getElementById('admin-id').value;
        const password = new FormData(form).get('password');

        try {
            await API.admin.register({ id, password, role: "admin" });
            alert('管理者を追加登録しました');
            Router.to('admin-main');
        } catch (error) {
            if (error?.response?.status === 409) {
                if (errorMsg) errorMsg.textContent = 'そのIDは既に存在します';
                return;
            }

            if (errorMsg) errorMsg.textContent = '登録失敗';
        }
    },

    submitRegisterWithAlert() {
        const form = document.getElementById('form-admin-reg');
        if (!form.reportValidity()) return;

        alert('管理者を追加登録しました');
        Router.to('admin-main');
    },

    // ===============================================
    // 備品ジャンル管理
    // ===============================================
    async initGenreMaster() {
        await this.renderGenreList();
    },

    async renderGenreList() {
        try {
            const genres = await AppState.loadGenres({ all: true, force: true });
            adminState.genres = genres;

            const tbody = document.getElementById('genre-list-body');
            if (!tbody) return;

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
            alert('ジャンル一覧の取得に失敗しました');
        }
    },

    async addGenre() {
        const name = document.getElementById('new-genre-name').value.trim();
        const code = document.getElementById('new-genre-code').value.trim();

        if (!name || !code) {
            alert('入力してください');
            return;
        }

        try {
            await API.genres.create({ name, code });
            alert('追加しました');

            await AppState.refreshGenres();
            await this.renderGenreList();

            document.getElementById('new-genre-name').value = '';
            document.getElementById('new-genre-code').value = '';
        } catch (error) {
            console.error(error);
            alert('追加失敗');
        }
    },

    async toggleGenre(id, nextIsDisabledState, name, code) {
        const action = nextIsDisabledState ? '無効化' : '有効化';
        if (!confirm(`${name} を${action}しますか？`)) return;

        try {
            await API.genres.update(id, {
                name,
                code,
                is_disabled: nextIsDisabledState
            });

            await AppState.refreshGenres();
            await this.renderGenreList();
        } catch (error) {
            alert('更新失敗: ' + error.message);
        }
    },

    async toggleGenreByIndex(index) {
        const genre = adminState.genres[index];
        if (!genre) {
            alert('対象ジャンルが見つかりません');
            return;
        }

        await this.toggleGenre(genre.id, !genre.is_disabled, genre.name, genre.code);
    }
};
