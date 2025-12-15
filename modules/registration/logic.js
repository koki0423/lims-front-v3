import { Router } from '../../js/router.js';

// 状態管理（簡易ストア）
// アプリが生きている間、ここに入力中のデータが溜まっていきます
const regState = {
    type: '', // 'individual' or 'bulk'
    data: {}  // 入力フォームのデータ
};

// HTMLのonclickから呼べるようにグローバル公開
window.RegController = {
    // P3: 管理方法選択
    setType(type) {
        regState.type = type;
        console.log('Selected Type:', type);
        Router.to('reg-input-1');
    },

    // P4 -> P5: 入力画面1の保存と遷移
    saveStep1() {
        const form = document.getElementById('form-reg-1');

        // ブラウザ標準のバリデーションチェック (required属性など)
        if (!form.reportValidity()) return;

        // データをStateに保存
        const formData = new FormData(form);
        for (let [key, val] of formData.entries()) {
            regState.data[key] = val;
        }

        console.log('Step1 Data:', regState.data);
        Router.to('reg-input-2');
    },

    // P5 -> P6: 入力画面2の保存と遷移
    saveStep2() {
        const form = document.getElementById('form-reg-2');

        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        for (let [key, val] of formData.entries()) {
            regState.data[key] = val;
        }

        console.log('Step2 Data:', regState.data);
        Router.to('reg-confirm');
    },

    // モック用: NFCボタンの挙動
    mockNfcRead() {
        const input = document.querySelector('input[name="registrant"]');
        if (input) {
            input.value = "AB12345 (NFC)";
            // 入力イベント発火（必要であれば）
        }
        alert('NFCカードを読み取りました（モック）');
    },

    submit() {
        console.log('Final Submit:', regState);
        regState.data = {};
        CommonController.showComplete('新規登録が完了しました');
    }
};

/**
 * 画面初期化用フック
 * Routerから呼ばれ、保存されているデータをフォームに復元します
 */
export function initRegistration(step) {
    console.log(`Initializing ${step}...`, regState.data);

    if (step === 'step2') {
        // Step1のデータをフォームに埋め戻す
        const form = document.getElementById('form-reg-1');
        if (form) restoreFormData(form, regState.data);
    }
    else if (step === 'step3') {
        // Step2のデータをフォームに埋め戻す
        const form = document.getElementById('form-reg-2');
        if (form) restoreFormData(form, regState.data);
    }
    else if (step === 'confirm') {
        // 確認画面の描画
        renderConfirm();
    }
}

// ヘルパー: フォームにオブジェクトの値をセットする
function restoreFormData(form, data) {
    Object.keys(data).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = data[key];
        }
    });
}

// ヘルパー: 確認画面描画
function renderConfirm() {
    const display = document.getElementById('confirm-display');
    if (!display) return;

    const typeLabel = regState.type === 'individual' ? '個別管理' : '一括管理';

    // PDFのデザインに合わせた項目表示
    display.innerHTML = `
        <div class="info-row"><span class="info-label">管理方法</span><span>${typeLabel}</span></div>
        <div class="info-row"><span class="info-label">備品名</span><span>${regState.data.itemName || ''}</span></div>
        <div class="info-row"><span class="info-label">メーカー</span><span>${regState.data.maker || ''}</span></div>
        <div class="info-row"><span class="info-label">型番</span><span>${regState.data.model || '-'}</span></div>
        <div class="info-row"><span class="info-label">シリアル</span><span>${regState.data.serial || '-'}</span></div>
        <div class="info-row"><span class="info-label">ジャンル</span><span>${regState.data.genre || ''}</span></div>
        <div class="info-row"><span class="info-label">保管場所</span><span>${regState.data.location || ''}</span></div>
        <div class="info-row"><span class="info-label">購入日</span><span>${regState.data.purchaseDate || ''}</span></div>
        <div class="info-row"><span class="info-label">登録者</span><span>${regState.data.registrant || ''}</span></div>
        <div class="info-row"><span class="info-label">備考</span><span>${regState.data.remarks || ''}</span></div>
    `;
}