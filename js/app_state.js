import { API } from './api.js';

function normalizeGenreResponse(response) {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    if (Array.isArray(response?.data)) {
        return response.data;
    }

    return [];
}

export const AppState = {
    genres: [],
    allGenres: [],
    _genresPromise: null,
    _allGenresPromise: null,

    async initMasterData() {
        try {
            await this.loadGenres();
        } catch (e) {
            console.error('Failed to load master data', e);
        }
    },

    async loadGenres({ all = false, force = false } = {}) {
        const listKey = all ? 'allGenres' : 'genres';
        const promiseKey = all ? '_allGenresPromise' : '_genresPromise';

        if (!force && this[listKey].length > 0) {
            return this[listKey];
        }

        if (!force && this[promiseKey]) {
            return this[promiseKey];
        }

        this[promiseKey] = (async () => {
            const response = await API.genres.list(all);
            const rows = normalizeGenreResponse(response);

            this[listKey] = rows;
            if (all) {
                this.genres = rows.filter((genre) => !genre.is_disabled);
            }

            return rows;
        })().finally(() => {
            this[promiseKey] = null;
        });

        return this[promiseKey];
    },

    async ensureMasterData() {
        return this.loadGenres();
    },

    async refreshGenres() {
        this.invalidateGenres();
        await Promise.all([
            this.loadGenres({ force: true }),
            this.loadGenres({ all: true, force: true })
        ]);
    },

    invalidateGenres() {
        this.genres = [];
        this.allGenres = [];
    },

    // ヘルパー: IDからジャンル名を取得
    getGenreName(id, { all = false } = {}) {
        const g = this.getGenreById(id, { all });
        return g ? g.name : '-';
    },

    // ヘルパー: IDからオブジェクトを取得
    getGenreById(id, { all = false } = {}) {
        const target = Number(id);
        const sources = all
            ? [this.allGenres, this.genres]
            : [this.genres, this.allGenres];

        for (const source of sources) {
            const found = source.find((item) => Number(item.id ?? item.genre_id) === target);
            if (found) {
                return found;
            }
        }

        return null;
    }
};
