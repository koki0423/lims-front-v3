import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { AppState } from '../../js/app_state.js';
import { scanStudentIdWithRetry } from "../../js/nfcReader.js";

window.AdminController = {
    // ===============================================
    // ログイン・管理者登録関連
    // ===============================================

    // NFCボタン
    async NfcRead() {
        const input = document.getElementById('admin-id');
        try {
            const result = await scanStudentIdWithRetry(9, 2000);
            if (result.ok) {
                console.log("OK:", result.studentId);
                input.value = result.studentId;
            } else {
                console.log("NG:", result.error);
                input.value = "error";
            }
        } catch (err) {
            console.error("scan error:", err);
            if (input) input.value = "error";
        }
    },

    // ログイン判定
    login() {
        const inputId="AL21034"; // テスト用固定ID
        const id = document.getElementById('admin-id').value;
        const pass = document.getElementById('admin-pass').value;
        const errorMsg = document.getElementById('login-error-msg');

        if (errorMsg) errorMsg.textContent = '';

        if (id === inputId && pass === 'admin') {
            console.log(`Admin Login Success: ${id}`);
            Router.to('admin-main');
        } else {
            if (errorMsg) {
                errorMsg.textContent = 'ログインに失敗しました。IDまたはパスワードが違います。';
            } else {
                alert('ログイン失敗: IDまたはパスワードが違います');
            }
        }
    },

    // ログアウト処理
    logout() {
        alert('ログアウトしました');
        Router.to('main-menu');
    },

    // 追加登録画面へ遷移
    toRegister() {
        Router.to('admin-register');
    },

    // 管理者追加登録実行
    submitRegister() {
        const form = document.getElementById('form-admin-reg');
        const errorMsg = document.getElementById('register-error-msg');

        if (errorMsg) errorMsg.textContent = '';

        if (!form.reportValidity()) {
            if (errorMsg) {
                errorMsg.textContent = '入力に不備があります。必須項目を入力してください。';
            }
            return;
        }

        const formData = new FormData(form);
        const password = formData.get('password');

        if (password.length < 4) {
            if (errorMsg) errorMsg.textContent = 'パスワードは4文字以上で設定してください。';
            return;
        }

        alert('管理者を追加登録しました');
        Router.to('admin-main');
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
        this.renderGenreList();
    },

    async renderGenreList() {
        // 管理画面なので全件取得 (?all=true)
        const genres = await API.genres.list(true);
        const tbody = document.getElementById('genre-list-body');
        if (!tbody) return; // 画面遷移タイミングによっては無い場合があるのでガード

        tbody.innerHTML = genres.map(g => {
            const disabledStyle = g.is_disabled ? 'background:#eee; color:#999;' : '';
            const statusText = g.is_disabled ? '無効' : '有効';
            const btnText = g.is_disabled ? '有効化' : '無効化';
            const nextState = !g.is_disabled;

            return `
            <tr style="${disabledStyle}">
                <td>${g.id}</td>
                <td>${g.name}</td>
                <td>${g.code}</td>
                <td>${statusText}</td>
                <td>
                    <button class="sm-btn" onclick="AdminController.toggleGenre(${g.id}, ${nextState}, '${g.name}', '${g.code}')">
                        ${btnText}
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    },

    async addGenre() {
        const name = document.getElementById('new-genre-name').value;
        const code = document.getElementById('new-genre-code').value;
        if (!name || !code) return alert('入力してください');

        try {
            await API.genres.create({ name, code });
            alert('追加しました');

            await AppState.initMasterData(); // マスタ再読み込み
            this.renderGenreList();

            document.getElementById('new-genre-name').value = '';
            document.getElementById('new-genre-code').value = '';
        } catch (e) {
            alert('追加失敗');
        }
    },

    async toggleGenre(id, nextIsDisabledState, name, code) {
        const action = nextIsDisabledState ? '無効化' : '有効化';
        if (!confirm(`${name} を${action}しますか？`)) return;

        try {
            await API.genres.update(id, {
                name: name,
                code: code,
                is_disabled: nextIsDisabledState
            });

            await AppState.initMasterData();
            this.renderGenreList();
        } catch (e) {
            alert('更新失敗: ' + e.message);
        }
    }
};