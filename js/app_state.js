import { API } from './api.js';

export const AppState = {
    genres: [],

    async initMasterData() {
        try {
            const res = await API.genres.list(); // 有効なものだけ取得
            this.genres = res;
            // console.log('Master data loaded:', this.genres);
        } catch (e) {
            console.error('Failed to load master data', e);
        }
    },

    // ヘルパー: IDからジャンル名を取得
    getGenreName(id) {
        const g = this.genres.find(item => item.id === Number(id));
        return g ? g.name : '-';
    },

    // ヘルパー: IDからオブジェクトを取得
    getGenreById(id) {
        return this.genres.find(item => item.id === Number(id));
    }
};