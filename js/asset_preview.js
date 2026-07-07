import { API } from './api.js';
import { escapeHtml } from './dom_utils.js';
import { clearFieldFeedback, setFieldFeedback } from './ui_feedback.js';

const STATUS_LABELS = {
    1: '正常',
    2: '故障',
    3: '修理中',
    4: '貸出中',
    5: '廃棄済み',
    6: '紛失'
};

const pairCache = new Map();
const pairRequestCache = new Map();

function normalizeManagementNumber(value) {
    if (!value) {
        return '';
    }

    let text = String(value).normalize('NFKC').trim();
    text = text.replace(/[‐-‒–—―ー−]/g, '-');
    return text.toUpperCase();
}

function canLookupPreview(managementNumber) {
    return managementNumber.includes('-') || managementNumber.length >= 8;
}

function getStatusLabel(statusId) {
    return STATUS_LABELS[Number(statusId)] || '不明';
}

function buildPreviewData(response) {
    const master = response?.master || {};
    const asset = response?.asset || {};

    return {
        managementNumber: normalizeManagementNumber(master.management_number || asset.management_number),
        name: String(master.name || asset.name || '').trim(),
        serial: String(asset.serial || '').trim(),
        status: getStatusLabel(asset.status_id),
        location: String(asset.location || asset.default_location || '').trim()
    };
}

function getLookupErrorMessage(error) {
    if (error?.response?.status === 404) {
        return '該当する備品が見つかりません。管理番号を確認してください。';
    }

    return (
        error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.response?.data?.error
        || (error instanceof Error ? error.message : '')
        || '備品情報の取得に失敗しました。'
    );
}

async function fetchAssetPair(managementNumber) {
    const key = normalizeManagementNumber(managementNumber);
    if (key === '') {
        return null;
    }

    if (pairCache.has(key)) {
        return pairCache.get(key);
    }

    if (pairRequestCache.has(key)) {
        return pairRequestCache.get(key);
    }

    const request = API.assets.getPair(key)
        .then((response) => {
            pairCache.set(key, response);
            return response;
        })
        .finally(() => {
            pairRequestCache.delete(key);
        });

    pairRequestCache.set(key, request);
    return request;
}

function createPreviewRow(label, value) {
    return `
        <div class="asset-preview-row">
            <span class="asset-preview-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || '-')}</strong>
        </div>
    `;
}

function renderPreviewState(container, html) {
    if (!container) {
        return;
    }

    container.hidden = false;
    container.innerHTML = html;
}

export function clearAssetPreview(containerId, emptyMessage = '管理番号を入力すると備品情報を表示します。') {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    renderPreviewState(
        container,
        `
            <div class="asset-preview-card asset-preview-empty">
                <strong>備品プレビュー</strong>
                <p>${escapeHtml(emptyMessage)}</p>
            </div>
        `
    );
}

export function mountAssetPreview(inputSelector, containerId, options = {}) {
    const input = document.querySelector(inputSelector);
    const container = document.getElementById(containerId);
    if (!input || !container) {
        return null;
    }

    const emptyMessage = options.emptyMessage || '管理番号を入力すると備品情報を表示します。';
    let debounceId = null;
    let requestSeq = 0;

    const renderLoading = () => {
        renderPreviewState(
            container,
            `
                <div class="asset-preview-card asset-preview-loading">
                    <strong>備品プレビュー</strong>
                    <p>備品情報を確認しています...</p>
                </div>
            `
        );
    };

    const renderResolved = (preview) => {
        renderPreviewState(
            container,
            `
                <div class="asset-preview-card">
                    <strong>備品プレビュー</strong>
                    <div class="asset-preview-grid">
                        ${createPreviewRow('備品番号', preview.managementNumber || '-')}
                        ${createPreviewRow('備品名', preview.name || '-')}
                        ${createPreviewRow('シリアル番号', preview.serial || '-')}
                        ${createPreviewRow('状態', preview.status || '-')}
                        ${createPreviewRow('保管場所', preview.location || '-')}
                    </div>
                </div>
            `
        );
    };

    const renderFailed = (message, isWarning = false) => {
        renderPreviewState(
            container,
            `
                <div class="asset-preview-card ${isWarning ? 'asset-preview-warning' : 'asset-preview-error'}">
                    <strong>備品プレビュー</strong>
                    <p>${escapeHtml(message)}</p>
                </div>
            `
        );
    };

    const refresh = async () => {
        const managementNumber = normalizeManagementNumber(input.value);
        input.value = managementNumber;

        if (!managementNumber || !canLookupPreview(managementNumber)) {
            clearFieldFeedback(input);
            clearAssetPreview(containerId, emptyMessage);
            return null;
        }

        const currentSeq = ++requestSeq;
        renderLoading();

        try {
            const response = await fetchAssetPair(managementNumber);
            if (currentSeq !== requestSeq) {
                return null;
            }

            const preview = buildPreviewData(response);
            clearFieldFeedback(input);
            renderResolved(preview);
            options.onResolved?.(preview);
            return preview;
        } catch (error) {
            if (currentSeq !== requestSeq) {
                return null;
            }

            const message = getLookupErrorMessage(error);
            const isWarning = error?.response?.status === 404;
            setFieldFeedback(input, message);
            renderFailed(message, isWarning);
            options.onResolved?.(null, error);
            return null;
        }
    };

    const queueRefresh = () => {
        if (debounceId) {
            clearTimeout(debounceId);
        }

        debounceId = setTimeout(() => {
            refresh();
        }, options.debounceMs ?? 350);
    };

    clearAssetPreview(containerId, emptyMessage);
    input.addEventListener('input', queueRefresh);
    input.addEventListener('blur', refresh);
    input.addEventListener('change', refresh);

    if (normalizeManagementNumber(input.value) !== '') {
        queueRefresh();
    }

    return {
        refresh,
        clear() {
            if (debounceId) {
                clearTimeout(debounceId);
            }
            clearFieldFeedback(input);
            clearAssetPreview(containerId, emptyMessage);
        }
    };
}

export { normalizeManagementNumber };
