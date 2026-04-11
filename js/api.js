import axios from 'https://cdn.jsdelivr.net/npm/axios@1.7.2/+esm';
import { getAdminToken, clearAdminToken } from './token.js';


//開発環境用APIベースURL
const API_BASE_URL = 'http://localhost:8443';

// 本番環境用APIベースURL
// const API_BASE_URL = '';

const API_PREFIX = '/api/v2';
const ASSETS_PREFIX = `${API_PREFIX}/assets`;
const LENDS_PREFIX = `${API_PREFIX}/lends`;
const RETURNS_PREFIX = `${API_PREFIX}/returns`;
const DISPOSALS_PREFIX = `${API_PREFIX}/disposals`;
const GENRES_PREFIX = `${API_PREFIX}/genres`;
const AUTH_PREFIX = API_PREFIX;

// axiosインスタンス
const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// レスポンス処理用インターセプター
client.interceptors.request.use((config) => {
    const token = getAdminToken();
    if (token) {
        if (!config.headers) config.headers = {};
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});

client.interceptors.response.use(
    (res) => res.data,
    (err) => {
        const status = err?.response?.status;
        if (status === 401) {
            clearAdminToken();
            // Router は window.Router を使う（router.jsで global 公開してる） :contentReference[oaicite:8]{index=8}
            if (window.Router) window.Router.to('admin-login');
        }
        console.error('API Error:', err);
        return Promise.reject(err);
    }
);

// === 2. エンドポイント定義 (機能ごとにオブジェクトでまとめる) ===
export const API = {
    // ■ 備品関連 (assets)
    assets: {
        // マスタ作成
        createMaster: (payload) => client.post(`${ASSETS_PREFIX}/masters`, payload),

        // 備品新規登録
        createAsset: (payload) => client.post(`${ASSETS_PREFIX}`, payload),

        // 一括登録
        batchRegister: (mode, formData) => client.post(`${ASSETS_PREFIX}/import?mode=${mode}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        }),

        // ラベルテンプレートダウンロード
        downloadTemplate: (width,type) => client.get(`${ASSETS_PREFIX}/print/templates?width=${width}&type=${type}`, { responseType: 'blob' }),

        // ラベル印刷
        printLabel: (payload) => client.post(`${ASSETS_PREFIX}/print`, payload),

        // バッチ印刷
        printBatch: (payload) => client.post(`${ASSETS_PREFIX}/print/batch`, payload),

        // マスタ一覧取得
        fetchMasters: () => client.get(`${ASSETS_PREFIX}/masters`),

        // 備品一覧取得
        fetchList: (params) => client.get(`${ASSETS_PREFIX}`, { params }), // paramsは { q: '...', status: '...' }

        // 備品詳細取得
        getById: (id) => client.get(`${ASSETS_PREFIX}/${id}`),

        // 備品マスタ取得
        getMasterById: (id) => client.get(`${ASSETS_PREFIX}/masters/${id}`),

        // 管理番号でマスタ・備品ペア情報を取得
        getPair: (managementNumber) => client.get(`${ASSETS_PREFIX}/pair/${managementNumber}`),

        // 備品更新
        update: (id, payload) => client.put(`${ASSETS_PREFIX}/${id}`, payload),

        // 集計情報取得
        fetchSummary: () => client.get(`${ASSETS_PREFIX}/summary`),

        // 名前で検索 (クエリパラメータで渡す)
        searchByName: (name) => client.get(`${ASSETS_PREFIX}/search?name=${encodeURIComponent(name)}`),

        // JANコード検索
        lookupJAN: (janCode) => client.get(`${ASSETS_PREFIX}/lookup/${janCode}`),
    },

    // ラベル印刷（assetsのやつとなんで分けたのかわからん忘れた）
    printLabel: {
        print: (data) => client.post(`${ASSETS_PREFIX}/print`, data),
    },

    // 貸出・返却
    lending: {
        register: (payload) => client.post(`${LEND_PREFIX}`, payload),
        fetchLends: (params) => client.get(`${LEND_PREFIX}`, { params }),
        getLend: (lendKey) => client.get(`${LENDS_PREFIX}/key${encodeURIComponent(lendKey)}`),
        fetchReturns: (params) => client.get(`${RETURN_PREFIX}`, { params }),
        returnAsset: (lendKey, payload) => client.post(`${RETURN_PREFIX}/key/${encodeURIComponent(lendKey)}`, payload),
    },

    // 廃棄
    disposal: {
        register: (management_number, data) => client.post(`${ASSETS_PREFIX}/${encodeURIComponent(management_number)}/disposals`, data),
        lookup: (mgmtCode) => client.get(`${ASSETS_PREFIX}/mgmt/${encodeURIComponent(mgmtCode)}`),
        fetchHistory: (params) => client.get(`${DISPOSAL_PREFIX}`, { params }),
    },

    // 管理者・認証
    admin: {
        login: (payload) => client.post('/api/v2/login', payload),
        register: (payload) => client.post('/api/v2/register', payload),
    },

    genres: {
        list: (all = false) => client.get(`/api/v2/genres${all ? '?all=true' : ''}`),
        create: (payload) => client.post('/api/v2/genres', payload),
        update: (id, payload) => client.put(`/api/v2/genres/${id}`, payload),
    }
};
