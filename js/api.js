import axios from 'https://cdn.jsdelivr.net/npm/axios@1.7.2/+esm';
import { getAdminToken, clearAdminToken } from './token.js';


//開発環境用APIベースURL
// const API_BASE_URL = 'http://localhost:8443';

// 本番環境用APIベースURL
const API_BASE_URL = '';


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
        createMaster: (payload) => client.post('/api/v2/assets/masters', payload),

        // 備品新規登録
        createAsset: (payload) => client.post('/api/v2/assets', payload),

        // 一括登録
        batchRegister: (mode, formData) => client.post(`/api/v2/assets/import?mode=${mode}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        }),

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
        register: (assetId, data) => client.post(`/api/v2/assets/${assetId}/lends`, data),
        fetchLends: () => client.get('/api/v2/lends'),
        returnAsset: (lendId, data) => client.post(`/api/v2/lends/${lendId}/returns`, data),
    },

    // 廃棄
    disposal: {
        register: (management_number, data) => client.post(`/api/v2/assets/${encodeURIComponent(management_number)}/disposals`, data),
        lookup: (mgmtCode) => client.get(`/api/v2/assets/mgmt/${encodeURIComponent(mgmtCode)}`, mgmtCode),// クエリ方式の場合: client.get('/api/v1/disposal', { params: { id: mgmtCode } })
        fetchHistory: () => client.get('/api/v2/disposals'),
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