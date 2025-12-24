import axios from 'https://cdn.jsdelivr.net/npm/axios@1.7.2/+esm';

const API_BASE_URL = 'http://localhost:8443';

// axiosインスタンス
const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// レスポンス処理用インターセプター
client.interceptors.response.use(
    (res) => res.data,
    (err) => {
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

        // ラベル印刷
        printLabel: (payload) => client.post('/api/v2/assets/print', payload),

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
    },

    // ラベル印刷（assetsのやつとなんで分けたのかわからん忘れた）
    printLabel: {
        print: (data) => client.post('/api/v2/assets/print', data),
    },

    // 貸出・返却
    lending: {
        register: (assetId, data) => client.post(`/api/v2/assets/${assetId}/lends`, data),
        fetchLends: () => client.get('/api/v2/lends'),
        returnAsset: (lendId, data) => client.post(`/api/v2/lends/${lendId}/returns`, data),
    },

    // 廃棄
    disposal: {
        register: (assetId, data) => client.post(`/api/v2/assets/${encodeURIComponent(assetId)}/disposals`, data), // 数値の asset.id で登録
        lookup: (mgmtCode) => client.get(`/api/v2/assets/mgmt/${encodeURIComponent(mgmtCode)}`, mgmtCode),// クエリ方式の場合: client.get('/api/v1/disposal', { params: { id: mgmtCode } })
        history: () => client.get('/api/v2/disposals'),
    },

    // 管理者・認証（まだバックエンド実装してない）
    admin: {
        login: (id, password) => client.post('/login', { id, password }),
        registerUser: (data) => client.post('/users', data),
    }
};