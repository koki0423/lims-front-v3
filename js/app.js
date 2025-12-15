import { Router } from './router.js';

// DOM読み込み完了時に初期画面を表示
document.addEventListener('DOMContentLoaded', () => {
    Router.to('main-menu');
});