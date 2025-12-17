import { Router } from '../../js/router.js';

window.AdminController = {
    // NFCボタン用モック
    mockNfcLogin() {
        const idInput = document.getElementById('admin-id');
        if (idInput) {
            idInput.value = 'admin';
            // ユーザービリティのため、パスワード欄にフォーカスを移動
            document.getElementById('admin-pass').focus();
        }
    },

    // ログイン判定
    login() {
        const id = document.getElementById('admin-id').value;
        const pass = document.getElementById('admin-pass').value;
        const errorMsg = document.getElementById('login-error-msg'); // エラー表示用

        // エラーメッセージをリセット
        if (errorMsg) errorMsg.textContent = '';

        // ★判定ロジック: admin / admin で成功
        if (id === 'admin' && pass === 'admin') {
            console.log(`Admin Login Success: ${id}`);
            Router.to('admin-main');
        } else {
            // 失敗時
            if (errorMsg) {
                errorMsg.textContent = 'ログインに失敗しました。IDまたはパスワードが違います。';
            } else {
                alert('ログイン失敗: IDまたはパスワードが違います');
            }
        }
    },

    // ログアウト処理
    logout() {
        // セッション破棄などの処理があればここに記述
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
        const errorMsg = document.getElementById('register-error-msg'); // HTMLで付けたIDを取得

        // メッセージを一旦クリア
        if (errorMsg) errorMsg.textContent = '';

        // バリデーションチェック
        // checkValidity() は true/false を返すだけ
        // reportValidity() は true/false を返しつつ、ブラウザ標準の吹き出しも出す
        if (!form.reportValidity()) {
            // --- バリデーションNGの場合 ---
            if (errorMsg) {
                errorMsg.textContent = '入力に不備があります。必須項目を入力してください。';
            }
            return; // 処理をここで止める
        }

        // --- バリデーションOKの場合 ---

        // ここでパスワードの長さチェックなどを独自に入れたい場合はこう書く
        const formData = new FormData(form);
        const password = formData.get('password'); // name="password" の値を取得

        if (password.length < 4) {
            if (errorMsg) errorMsg.textContent = 'パスワードは4文字以上で設定してください。';
            return;
        }

        // すべてOKなら登録完了処理へ
        alert('管理者を追加登録しました');
        Router.to('admin-main');

        // CommonControllerを使う場合
        // window.CommonController.showComplete('管理者を登録しました');

        // ※以前の話にあった「戻り先」の問題は一旦置いておき、まずはこれで動くか確認
    },

    // CommonControllerの拡張が面倒な場合の代替submit
    submitRegisterWithAlert() {
        const form = document.getElementById('form-admin-reg');
        if (!form.reportValidity()) return;

        alert('管理者を追加登録しました');
        Router.to('admin-main');
    }
};