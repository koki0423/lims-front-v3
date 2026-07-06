import axios from 'https://cdn.jsdelivr.net/npm/axios@1.7.2/+esm';
import { getAdminToken, clearAdminToken } from './token.js';


//開発環境用APIベースURL
const API_BASE_URL = 'http://localhost:8443';

// 本番環境用APIベースURL
// const API_BASE_URL = '';



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
            const hadAdminToken = Boolean(getAdminToken());
            clearAdminToken();
            if (hadAdminToken && window.Router) {
                window.Router.to('admin-login');
            }
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
        createMaster: (payload) => client.post('/api/v2/assets/masters', payload),

        // 備品新規登録
        createAsset: (payload) => client.post('/api/v2/assets', payload),

        // 一括登録
        batchRegister: (mode, formData) => client.post(`/api/v2/assets/import?mode=${mode}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        }),

        // ラベルテンプレートダウンロード
        downloadTemplate: (width,type) => client.get(`/api/v2/assets/print/templates?width=${width}&type=${type}`, { responseType: 'blob' }),

        // ラベル印刷
        printLabel: (payload) => client.post('/api/v2/assets/print', payload),

        // バッチ印刷
        printBatch: (payload) => client.post('/api/v2/assets/print/batch', payload),

        // マスタ一覧取得
        fetchMasters: () => client.get('/api/v2/assets/masters'),

        // 備品一覧取得
        fetchList: (params) => client.get('/api/v2/assets', { params }), // paramsは { q: '...', status: '...' }

        // 備品詳細取得
        getById: (id) => client.get(`/api/v2/assets/${id}`),

        // 備品マスタ取得
        getMasterById: (id) => client.get(`/api/v2/assets/masters/${id}`),

        // 管理番号でマスタ・備品ペア情報を取得
        getPair: (managementNumber) => client.get(`/api/v2/assets/pair/${managementNumber}`),

        // 備品更新
        update: (id, payload) => client.put(`/api/v2/assets/${id}`, payload),

        // 集計情報取得
        fetchSummary: () => client.get('/api/v2/assets/summary'),

        // 名前で検索 (クエリパラメータで渡す)
        searchByName: (name) => client.get(`/api/v2/assets/search?name=${encodeURIComponent(name)}`),

        // JANコード検索
        lookupJAN: (janCode) => client.get(`/api/v2/assets/lookup/${janCode}`),
    },

    // ラベル印刷（assetsのやつとなんで分けたのかわからん忘れた）
    printLabel: {
        print: (data) => client.post('/api/v2/assets/print', data),
    },

    // 貸出・返却
    lending: {
        register: (payload) => client.post('/api/v2/lends', payload),
        fetchLends: (params) => client.get('/api/v2/lends', { params }),
        getLend: (lendKey) => client.get(`/api/v2/lends/${encodeURIComponent(lendKey)}`),
        fetchReturns: (params) => client.get('/api/v2/returns', { params }),
        returnAsset: (lendKey, payload) => client.post(`/api/v2/returns/key/${encodeURIComponent(lendKey)}`, payload),
    },

    // 廃棄
    disposal: {
        register: (management_number, data) => client.post(`/api/v2/assets/${encodeURIComponent(management_number)}/disposals`, data),
        lookup: (mgmtCode) => client.get(`/api/v2/assets/mgmt/${encodeURIComponent(mgmtCode)}`),
        fetchHistory: (params) => client.get('/api/v2/disposals', { params }),
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
    },

    computers: {
        details: {
            create: (payload) => client.post('/api/v2/computer-details', payload),
            get: (assetMasterId) => client.get(`/api/v2/computer-details/${assetMasterId}`),
            update: (assetMasterId, payload) => client.put(`/api/v2/computer-details/${assetMasterId}`, payload),
        },
        parts: {
            create: (payload) => client.post('/api/v2/computer-parts', payload),
            get: (assetMasterId) => client.get(`/api/v2/computer-parts/${assetMasterId}`),
            update: (assetMasterId, payload) => client.put(`/api/v2/computer-parts/${assetMasterId}`, payload),
        },
        configurations: {
            create: (payload) => client.post('/api/v2/computer-configurations', payload),
            list: (computerAssetMasterId) => client.get(`/api/v2/computers/${computerAssetMasterId}/configurations`),
            update: (configurationId, payload) => client.put(`/api/v2/computer-configurations/${configurationId}`, payload),
        },
        partTypes: {
            list: () => client.get('/api/v2/part-types'),
        },
        usageStatuses: {
            list: () => client.get('/api/v2/usage-statuses'),
        }
    }
};
