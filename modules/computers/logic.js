import { Router } from '../../js/router.js';
import { API } from '../../js/api.js';
import { escapeHtml } from '../../js/dom_utils.js';
import {
    clearComputerAccess,
    getComputerOperatorName,
    setComputerAccess
} from '../../js/token.js';

const computersState = {
    operatorName: '',
    partTypes: [],
    usageStatuses: [],
    details: createEmptyDetailsState(),
    parts: createEmptyPartsState(),
    configurations: createEmptyConfigurationsState(),
};

function createEmptyDetailsState() {
    return {
        managementNumber: '',
        pair: null,
        record: null,
    };
}

function createEmptyPartsState() {
    return {
        managementNumber: '',
        pair: null,
        record: null,
    };
}

function createEmptyConfigurationsState() {
    return {
        computerManagementNumber: '',
        computerPair: null,
        rows: [],
        editingId: null,
        partManagementNumber: '',
        partPair: null,
    };
}

function resetComputerModuleState({ keepReferences = true } = {}) {
    computersState.operatorName = '';
    computersState.details = createEmptyDetailsState();
    computersState.parts = createEmptyPartsState();
    computersState.configurations = createEmptyConfigurationsState();

    if (!keepReferences) {
        computersState.partTypes = [];
        computersState.usageStatuses = [];
    }
}

function getApiErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || fallbackMessage;
}

function isNotFoundError(error) {
    const status = error?.response?.status;
    const code = error?.response?.data?.error?.code;
    return status === 404 || code === 'NOT_FOUND';
}

function normalizeArrayResponse(response) {
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

function normalizeRecordResponse(response) {
    return response?.data || response || null;
}

function normalizePairResponse(response) {
    const payload = response?.data || response;
    if (!payload?.master) {
        throw new Error('備品情報の形式が不正です');
    }

    return payload;
}

function getMasterIdFromPair(pair) {
    return Number(pair?.master?.asset_master_id || 0);
}

function getManagementNumberFromPair(pair) {
    return String(pair?.master?.management_number || pair?.asset?.management_number || '').trim();
}

function getAssetNameFromPair(pair) {
    return String(pair?.master?.name || pair?.asset?.name || '').trim();
}

function getAssetCategoryLabel(pair) {
    const rawValue = pair?.master?.management_category_id;
    if (Number(rawValue) === 1) {
        return '個別管理';
    }
    if (Number(rawValue) === 2) {
        return '一括管理';
    }

    return rawValue === null || rawValue === undefined || rawValue === ''
        ? '-'
        : String(rawValue);
}

function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value ?? '';
    }
}

function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? String(element.value || '') : '';
}

function getTrimmedInputValue(id) {
    return getInputValue(id).trim();
}

function setStatus(containerId, message = '', tone = 'info') {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    if (!message) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `<div class="batch-status-banner ${escapeHtml(tone)}">${escapeHtml(message)}</div>`;
}

function renderAssetSummary(containerId, pair, roleLabel) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }

    if (!pair) {
        container.innerHTML = '';
        return;
    }

    const managementNumber = getManagementNumberFromPair(pair) || '-';
    const assetName = getAssetNameFromPair(pair) || '-';
    const masterId = getMasterIdFromPair(pair);
    const category = getAssetCategoryLabel(pair);

    container.innerHTML = `
        <div class="computer-summary-card">
            <div class="computer-summary-card-title">${escapeHtml(roleLabel)}</div>
            <div class="computer-summary-grid">
                <div class="computer-summary-item">
                    <span>管理番号</span>
                    <strong>${escapeHtml(managementNumber)}</strong>
                </div>
                <div class="computer-summary-item">
                    <span>備品名</span>
                    <strong>${escapeHtml(assetName)}</strong>
                </div>
                <div class="computer-summary-item">
                    <span>備品マスタID</span>
                    <strong>${masterId || '-'}</strong>
                </div>
                <div class="computer-summary-item">
                    <span>管理区分</span>
                    <strong>${escapeHtml(category)}</strong>
                </div>
            </div>
        </div>
    `;
}

function renderUsageStatusOptions(selectedId = '') {
    const select = document.getElementById('computer-part-usage-status');
    if (!select) {
        return;
    }

    const placeholder = '<option value="">使用状態を選択してください</option>';
    const options = computersState.usageStatuses.map((row) => {
        const id = Number(row.usage_status_id);
        const selected = String(id) === String(selectedId) ? ' selected' : '';
        const label = row.usage_status_display_name || row.display_name || row.name || id;
        return `<option value="${id}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    select.innerHTML = options ? `${placeholder}${options}` : '<option value="">選択肢がありません</option>';
}

function renderPartTypeOptions(selectedId = '') {
    const select = document.getElementById('computer-config-part-type');
    if (!select) {
        return;
    }

    const placeholder = '<option value="">部品種別を選択してください</option>';
    const options = computersState.partTypes.map((row) => {
        const id = Number(row.part_type_id);
        const selected = String(id) === String(selectedId) ? ' selected' : '';
        const label = row.part_type_display_name || row.display_name || row.name || id;
        return `<option value="${id}"${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    select.innerHTML = `${placeholder}${options}`;
}

function fillComputerDetailForm(record) {
    setInputValue('computer-detail-hostname', record?.hostname || '');
    setInputValue('computer-detail-ip', record?.ip_address || '');
    setInputValue('computer-detail-mac', record?.mac_address || '');
    setInputValue('computer-detail-os', record?.os || '');
    setInputValue('computer-detail-purpose', record?.purpose || '');
    setInputValue('computer-detail-login-user', record?.login_user || '');
    setInputValue('computer-detail-note', record?.note || '');
}

function getActivePartTypeLabel(record) {
    if (!record) {
        return '';
    }

    const label = String(
        record?.active_part_type_display_name
        || record?.active_part_type_name
        || ''
    ).trim();
    if (label) {
        return label;
    }

    if (
        record?.active_part_type_id !== null
        && record?.active_part_type_id !== undefined
        && record?.active_part_type_id !== ''
    ) {
        return String(record.active_part_type_id);
    }

    return 'アクティブ構成なし';
}

function fillComputerPartForm(record) {
    setInputValue('computer-part-active-type', getActivePartTypeLabel(record));
    renderUsageStatusOptions(record?.usage_status_id || '');
    setInputValue('computer-part-spec', record?.spec || '');
    setInputValue('computer-part-note', record?.note || '');
}

function clearComputerDetailForm() {
    fillComputerDetailForm(null);
}

function clearComputerPartForm() {
    renderUsageStatusOptions('');
    fillComputerPartForm(null);
}

function ensureSelectedPairMatchesInput(inputId, pair) {
    if (!pair) {
        return false;
    }

    return getTrimmedInputValue(inputId) === getManagementNumberFromPair(pair);
}

async function ensureComputerReferenceData(force = false) {
    if (!force && computersState.partTypes.length > 0 && computersState.usageStatuses.length > 0) {
        return;
    }

    const [partTypesResponse, usageStatusesResponse] = await Promise.all([
        API.computers.partTypes.list(),
        API.computers.usageStatuses.list(),
    ]);

    computersState.partTypes = normalizeArrayResponse(partTypesResponse);
    computersState.usageStatuses = normalizeArrayResponse(usageStatusesResponse);
}

async function resolveAssetPairByManagementNumber(managementNumber) {
    const response = await API.assets.getPair(managementNumber);
    const pair = normalizePairResponse(response);
    const masterId = getMasterIdFromPair(pair);
    if (!masterId) {
        throw new Error('備品マスタIDを解決できませんでした');
    }

    return pair;
}

async function loadComputerDetailRecordByPair(pair) {
    const masterId = getMasterIdFromPair(pair);
    const response = await API.computers.details.get(masterId);
    return normalizeRecordResponse(response);
}

async function loadComputerPartRecordByPair(pair) {
    const masterId = getMasterIdFromPair(pair);
    const response = await API.computers.parts.get(masterId);
    return normalizeRecordResponse(response);
}

function getComputerDetailCreatePayload(pair) {
    const payload = {
        asset_master_id: getMasterIdFromPair(pair),
    };

    const fields = {
        hostname: getTrimmedInputValue('computer-detail-hostname'),
        ip_address: getTrimmedInputValue('computer-detail-ip'),
        mac_address: getTrimmedInputValue('computer-detail-mac'),
        os: getTrimmedInputValue('computer-detail-os'),
        purpose: getTrimmedInputValue('computer-detail-purpose'),
        login_user: getTrimmedInputValue('computer-detail-login-user'),
        note: getTrimmedInputValue('computer-detail-note'),
    };

    Object.entries(fields).forEach(([key, value]) => {
        if (value !== '') {
            payload[key] = value;
        }
    });

    return payload;
}

function getComputerDetailUpdatePayload() {
    return {
        hostname: getTrimmedInputValue('computer-detail-hostname'),
        ip_address: getTrimmedInputValue('computer-detail-ip'),
        mac_address: getTrimmedInputValue('computer-detail-mac'),
        os: getTrimmedInputValue('computer-detail-os'),
        purpose: getTrimmedInputValue('computer-detail-purpose'),
        login_user: getTrimmedInputValue('computer-detail-login-user'),
        note: getTrimmedInputValue('computer-detail-note'),
    };
}

function getComputerPartCreatePayload(pair) {
    const usageStatusId = Number(getInputValue('computer-part-usage-status'));
    if (!Number.isFinite(usageStatusId) || usageStatusId <= 0) {
        throw new Error('使用状態を選択してください');
    }

    const payload = {
        asset_master_id: getMasterIdFromPair(pair),
        usage_status_id: usageStatusId,
    };

    const spec = getTrimmedInputValue('computer-part-spec');
    const note = getTrimmedInputValue('computer-part-note');
    if (spec !== '') {
        payload.spec = spec;
    }
    if (note !== '') {
        payload.note = note;
    }

    return payload;
}

function getComputerPartUpdatePayload() {
    const usageStatusId = Number(getInputValue('computer-part-usage-status'));
    if (!Number.isFinite(usageStatusId) || usageStatusId <= 0) {
        throw new Error('使用状態を選択してください');
    }

    return {
        usage_status_id: usageStatusId,
        spec: getTrimmedInputValue('computer-part-spec'),
        note: getTrimmedInputValue('computer-part-note'),
    };
}

function getConfigurationFormValues() {
    return {
        partTypeId: Number(getInputValue('computer-config-part-type')),
        installedAt: getTrimmedInputValue('computer-config-installed-at'),
        removedAt: getTrimmedInputValue('computer-config-removed-at'),
        note: getTrimmedInputValue('computer-config-note'),
    };
}

function validateConfigurationDates(installedAt, removedAt) {
    if (!installedAt || !removedAt) {
        return;
    }

    if (removedAt < installedAt) {
        throw new Error('取り外し日は装着日以降の日付を入力してください');
    }
}

function createPairStubFromConfigurationRow(row) {
    return {
        master: {
            asset_master_id: row.part_asset_master_id,
            management_number: row.part_management_number,
            name: row.part_name,
            management_category_id: null,
        },
        asset: {
            management_number: row.part_management_number,
        }
    };
}

function renderConfigurationRows() {
    const host = document.getElementById('computer-configuration-list');
    if (!host) {
        return;
    }

    if (!computersState.configurations.computerPair) {
        host.innerHTML = '<div class="history-empty-state"><strong>対象計算機が未選択です</strong><p>先に計算機本体の管理番号を読み込んでください。</p></div>';
        return;
    }

    const rows = computersState.configurations.rows;
    if (rows.length === 0) {
        host.innerHTML = '<div class="history-empty-state"><strong>構成履歴はまだありません</strong><p>対象計算機を読み込んだあと、この画面から部品構成を追加できます。</p></div>';
        return;
    }

    const tableRows = rows.map((row) => {
        const isActive = !row.removed_at;
        const statusClass = isActive ? 'badge-normal' : 'badge-gray';
        const statusLabel = isActive ? 'アクティブ' : '取り外し済み';

        return `
            <tr>
                <td>${escapeHtml(row.part_type_display_name || row.part_type_name || '-')}</td>
                <td>${escapeHtml(row.part_management_number || '-')}</td>
                <td>${escapeHtml(row.part_name || '-')}</td>
                <td>${escapeHtml(row.installed_at || '-')}</td>
                <td>${escapeHtml(row.removed_at || '-')}</td>
                <td>${escapeHtml(row.note || '-')}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
                <td class="table-cell-center">
                    <button class="sm-btn" type="button" onclick="ComputerController.editConfiguration(${Number(row.computer_configuration_id)})">編集</button>
                </td>
            </tr>
        `;
    }).join('');

    host.innerHTML = `
        <div class="panel-scroll">
            <table class="data-table computer-config-table">
                <thead>
                    <tr>
                        <th>部品種別</th>
                        <th>部品管理番号</th>
                        <th>部品名</th>
                        <th>装着日</th>
                        <th>取り外し日</th>
                        <th>備考</th>
                        <th>状態</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;
}

function renderConfigurationEditor() {
    setInputValue('computer-config-computer-mgmt-input', computersState.configurations.computerManagementNumber);
    setInputValue('computer-config-part-mgmt-input', computersState.configurations.partManagementNumber);
    renderAssetSummary('computer-configuration-computer-summary', computersState.configurations.computerPair, '対象計算機');
    renderAssetSummary('computer-configuration-part-summary', computersState.configurations.partPair, '対象部品');

    const editingId = computersState.configurations.editingId;
    const titleEl = document.getElementById('computer-configuration-form-title');
    const saveButton = document.getElementById('computer-configuration-save-btn');
    if (titleEl) {
        titleEl.textContent = editingId ? '構成履歴の更新' : '構成履歴の新規登録';
    }
    if (saveButton) {
        saveButton.textContent = editingId ? '更新する' : '登録する';
    }

    renderConfigurationRows();
}

function clearConfigurationEditorForm() {
    computersState.configurations.editingId = null;
    computersState.configurations.partManagementNumber = '';
    computersState.configurations.partPair = null;
    setInputValue('computer-config-part-mgmt-input', '');
    setInputValue('computer-config-installed-at', '');
    setInputValue('computer-config-removed-at', '');
    setInputValue('computer-config-note', '');
    renderPartTypeOptions('');
    renderAssetSummary('computer-configuration-part-summary', null, '対象部品');
    renderConfigurationEditor();
}

async function refreshConfigurationListInternal(showSuccessMessage = true) {
    const pair = computersState.configurations.computerPair;
    if (!pair) {
        renderConfigurationRows();
        setStatus('computer-configuration-list-status', '先に対象計算機を読み込んでください。', 'info');
        return;
    }

    try {
        const response = await API.computers.configurations.list(getMasterIdFromPair(pair));
        computersState.configurations.rows = normalizeArrayResponse(response);
        renderConfigurationRows();

        if (showSuccessMessage) {
            setStatus('computer-configuration-list-status', `構成履歴を ${computersState.configurations.rows.length} 件読み込みました。`, 'success');
        }
    } catch (error) {
        computersState.configurations.rows = [];
        renderConfigurationRows();
        setStatus('computer-configuration-list-status', getApiErrorMessage(error, '構成履歴の取得に失敗しました。'), 'error');
    }
}

function fillConfigurationFormFromRow(row) {
    computersState.configurations.editingId = Number(row.computer_configuration_id);
    computersState.configurations.partManagementNumber = row.part_management_number || '';
    computersState.configurations.partPair = createPairStubFromConfigurationRow(row);
    setInputValue('computer-config-part-mgmt-input', row.part_management_number || '');
    setInputValue('computer-config-installed-at', row.installed_at || '');
    setInputValue('computer-config-removed-at', row.removed_at || '');
    setInputValue('computer-config-note', row.note || '');
    renderPartTypeOptions(row.part_type_id || '');
    renderConfigurationEditor();
    setStatus('computer-configuration-status', `構成履歴 ID ${row.computer_configuration_id} を編集中です。`, 'info');
}

function renderComputerDetailView() {
    setInputValue('computer-detail-mgmt-input', computersState.details.managementNumber);
    renderAssetSummary('computer-detail-summary', computersState.details.pair, '対象計算機');
    fillComputerDetailForm(computersState.details.record);

    const saveButton = document.getElementById('computer-detail-save-btn');
    if (saveButton) {
        saveButton.textContent = computersState.details.record ? '更新する' : '登録する';
    }
}

function renderComputerPartView() {
    setInputValue('computer-part-mgmt-input', computersState.parts.managementNumber);
    renderAssetSummary('computer-part-summary', computersState.parts.pair, '対象部品');
    fillComputerPartForm(computersState.parts.record);

    const saveButton = document.getElementById('computer-part-save-btn');
    if (saveButton) {
        saveButton.textContent = computersState.parts.record ? '更新する' : '登録する';
    }
}

function renderComputerMainView() {
    const operatorDisplay = document.getElementById('computer-operator-display');
    if (operatorDisplay) {
        operatorDisplay.textContent = computersState.operatorName || getComputerOperatorName() || '-';
    }
}

window.ComputerController = {
    login() {
        const operatorName = getTrimmedInputValue('computer-operator-name');
        const accessCode = getTrimmedInputValue('computer-access-code');
        const errorEl = document.getElementById('computer-login-error');

        if (errorEl) {
            errorEl.textContent = '';
        }

        if (!operatorName || !accessCode) {
            if (errorEl) {
                errorEl.textContent = '担当者名とアクセスコードを入力してください。';
            }
            return;
        }

        setComputerAccess(operatorName);
        computersState.operatorName = operatorName;
        Router.to('computer-main');
    },

    logout() {
        clearComputerAccess();
        resetComputerModuleState({ keepReferences: false });
        Router.to('main-menu');
    },

    async loadComputerDetailAsset() {
        const managementNumber = getTrimmedInputValue('computer-detail-mgmt-input');
        if (!managementNumber) {
            setStatus('computer-detail-status', '管理番号を入力してください。', 'warning');
            return;
        }

        computersState.details.managementNumber = managementNumber;

        try {
            const pair = await resolveAssetPairByManagementNumber(managementNumber);
            computersState.details.managementNumber = getManagementNumberFromPair(pair);
            computersState.details.pair = pair;
            renderComputerDetailView();

            try {
                const record = await loadComputerDetailRecordByPair(pair);
                computersState.details.record = record;
                fillComputerDetailForm(record);
                setStatus('computer-detail-status', '既存の計算機詳細を読み込みました。内容を編集して更新できます。', 'success');
            } catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }

                computersState.details.record = null;
                clearComputerDetailForm();
                setStatus('computer-detail-status', 'この備品にはまだ計算機詳細が登録されていません。入力して登録してください。', 'info');
            }

            renderComputerDetailView();
        } catch (error) {
            computersState.details.pair = null;
            computersState.details.record = null;
            renderComputerDetailView();
            setStatus('computer-detail-status', getApiErrorMessage(error, '備品情報の読み込みに失敗しました。'), 'error');
        }
    },

    resetComputerDetail() {
        computersState.details = createEmptyDetailsState();
        setStatus('computer-detail-status');
        renderComputerDetailView();
    },

    async saveComputerDetail() {
        const pair = computersState.details.pair;
        if (!pair) {
            setStatus('computer-detail-status', '先に対象計算機を読み込んでください。', 'warning');
            return;
        }

        if (!ensureSelectedPairMatchesInput('computer-detail-mgmt-input', pair)) {
            setStatus('computer-detail-status', '管理番号を変更した場合は、もう一度備品を読み込んでください。', 'warning');
            return;
        }

        try {
            const isUpdate = Boolean(computersState.details.record);

            if (isUpdate) {
                await API.computers.details.update(
                    getMasterIdFromPair(pair),
                    getComputerDetailUpdatePayload()
                );
            } else {
                await API.computers.details.create(getComputerDetailCreatePayload(pair));
            }

            computersState.details.record = await loadComputerDetailRecordByPair(pair);
            renderComputerDetailView();
            setStatus(
                'computer-detail-status',
                isUpdate ? '計算機詳細を更新しました。' : '計算機詳細を登録しました。',
                'success'
            );
        } catch (error) {
            setStatus('computer-detail-status', getApiErrorMessage(error, '計算機詳細の保存に失敗しました。'), 'error');
        }
    },

    async loadComputerPartAsset() {
        const managementNumber = getTrimmedInputValue('computer-part-mgmt-input');
        if (!managementNumber) {
            setStatus('computer-part-status', '管理番号を入力してください。', 'warning');
            return;
        }

        computersState.parts.managementNumber = managementNumber;

        try {
            const pair = await resolveAssetPairByManagementNumber(managementNumber);
            computersState.parts.managementNumber = getManagementNumberFromPair(pair);
            computersState.parts.pair = pair;
            renderComputerPartView();

            try {
                const record = await loadComputerPartRecordByPair(pair);
                computersState.parts.record = record;
                fillComputerPartForm(record);
                setStatus('computer-part-status', '既存の計算機部品情報を読み込みました。内容を編集して更新できます。', 'success');
            } catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }

                computersState.parts.record = null;
                clearComputerPartForm();
                setStatus('computer-part-status', 'この備品にはまだ計算機部品情報が登録されていません。入力して登録してください。', 'info');
            }

            renderComputerPartView();
        } catch (error) {
            computersState.parts.pair = null;
            computersState.parts.record = null;
            renderComputerPartView();
            setStatus('computer-part-status', getApiErrorMessage(error, '部品備品の読み込みに失敗しました。'), 'error');
        }
    },

    resetComputerPart() {
        computersState.parts = createEmptyPartsState();
        clearComputerPartForm();
        setStatus('computer-part-status');
        renderComputerPartView();
    },

    async saveComputerPart() {
        const pair = computersState.parts.pair;
        if (!pair) {
            setStatus('computer-part-status', '先に対象部品を読み込んでください。', 'warning');
            return;
        }

        if (!ensureSelectedPairMatchesInput('computer-part-mgmt-input', pair)) {
            setStatus('computer-part-status', '管理番号を変更した場合は、もう一度備品を読み込んでください。', 'warning');
            return;
        }

        try {
            if (computersState.parts.record) {
                await API.computers.parts.update(
                    getMasterIdFromPair(pair),
                    getComputerPartUpdatePayload()
                );
            } else {
                await API.computers.parts.create(getComputerPartCreatePayload(pair));
            }

            computersState.parts.record = await loadComputerPartRecordByPair(pair);
            renderComputerPartView();
            setStatus('computer-part-status', '計算機部品情報を保存しました。', 'success');
        } catch (error) {
            setStatus('computer-part-status', getApiErrorMessage(error, '計算機部品情報の保存に失敗しました。'), 'error');
        }
    },

    async loadConfigurationComputer() {
        const managementNumber = getTrimmedInputValue('computer-config-computer-mgmt-input');
        if (!managementNumber) {
            setStatus('computer-configuration-status', '計算機本体の管理番号を入力してください。', 'warning');
            return;
        }

        computersState.configurations.computerManagementNumber = managementNumber;

        try {
            const pair = await resolveAssetPairByManagementNumber(managementNumber);
            computersState.configurations.computerManagementNumber = getManagementNumberFromPair(pair);
            computersState.configurations.computerPair = pair;
            computersState.configurations.rows = [];
            clearConfigurationEditorForm();
            setStatus('computer-configuration-status', '対象計算機を読み込みました。構成履歴を確認してください。', 'success');
            await refreshConfigurationListInternal();
        } catch (error) {
            computersState.configurations.computerPair = null;
            computersState.configurations.rows = [];
            clearConfigurationEditorForm();
            setStatus('computer-configuration-status', getApiErrorMessage(error, '計算機本体の読み込みに失敗しました。'), 'error');
        }
    },

    resetConfigurationContext() {
        computersState.configurations = createEmptyConfigurationsState();
        setInputValue('computer-config-computer-mgmt-input', '');
        setInputValue('computer-config-part-mgmt-input', '');
        setInputValue('computer-config-installed-at', '');
        setInputValue('computer-config-removed-at', '');
        setInputValue('computer-config-note', '');
        renderConfigurationEditor();
        renderPartTypeOptions('');
        setStatus('computer-configuration-status');
        setStatus('computer-configuration-list-status');
    },

    async refreshConfigurationList() {
        await refreshConfigurationListInternal();
    },

    async resolveConfigurationPart() {
        const managementNumber = getTrimmedInputValue('computer-config-part-mgmt-input');
        if (!managementNumber) {
            setStatus('computer-configuration-status', '部品の管理番号を入力してください。', 'warning');
            return;
        }

        computersState.configurations.partManagementNumber = managementNumber;

        try {
            const pair = await resolveAssetPairByManagementNumber(managementNumber);
            computersState.configurations.partManagementNumber = getManagementNumberFromPair(pair);
            computersState.configurations.partPair = pair;
            renderConfigurationEditor();
            setStatus('computer-configuration-status', '対象部品を読み込みました。', 'success');
        } catch (error) {
            computersState.configurations.partPair = null;
            renderConfigurationEditor();
            setStatus('computer-configuration-status', getApiErrorMessage(error, '部品備品の読み込みに失敗しました。'), 'error');
        }
    },

    clearConfigurationEditor() {
        clearConfigurationEditorForm();
        setStatus('computer-configuration-status');
    },

    editConfiguration(configurationId) {
        const row = computersState.configurations.rows.find((entry) => {
            return Number(entry.computer_configuration_id) === Number(configurationId);
        });

        if (!row) {
            setStatus('computer-configuration-status', '編集対象の構成履歴が見つかりません。', 'error');
            return;
        }

        fillConfigurationFormFromRow(row);
    },

    async saveConfiguration() {
        const computerPair = computersState.configurations.computerPair;
        if (!computerPair) {
            setStatus('computer-configuration-status', '先に対象計算機を読み込んでください。', 'warning');
            return;
        }

        if (!ensureSelectedPairMatchesInput('computer-config-computer-mgmt-input', computerPair)) {
            setStatus('computer-configuration-status', '計算機本体の管理番号を変更した場合は、もう一度読み込んでください。', 'warning');
            return;
        }

        const currentPartInput = getTrimmedInputValue('computer-config-part-mgmt-input');
        if (!currentPartInput) {
            setStatus('computer-configuration-status', '部品の管理番号を入力してください。', 'warning');
            return;
        }

        if (
            !computersState.configurations.partPair
            || currentPartInput !== getManagementNumberFromPair(computersState.configurations.partPair)
        ) {
            setStatus('computer-configuration-status', '部品の管理番号を変更した場合は、対象部品を読み込んでください。', 'warning');
            return;
        }

        try {
            const formValues = getConfigurationFormValues();
            if (!Number.isFinite(formValues.partTypeId) || formValues.partTypeId <= 0) {
                throw new Error('部品種別を選択してください');
            }

            validateConfigurationDates(formValues.installedAt, formValues.removedAt);

            const partPair = computersState.configurations.partPair;
            if (!partPair) {
                throw new Error('対象部品を読み込んでください');
            }

            if (computersState.configurations.editingId) {
                await API.computers.configurations.update(
                    computersState.configurations.editingId,
                    {
                        part_asset_master_id: getMasterIdFromPair(partPair),
                        part_type_id: formValues.partTypeId,
                        installed_at: formValues.installedAt || '',
                        removed_at: formValues.removedAt || '',
                        note: formValues.note,
                    }
                );
            } else {
                const payload = {
                    computer_asset_master_id: getMasterIdFromPair(computerPair),
                    part_asset_master_id: getMasterIdFromPair(partPair),
                    part_type_id: formValues.partTypeId,
                };

                if (formValues.installedAt) {
                    payload.installed_at = formValues.installedAt;
                }
                if (formValues.removedAt) {
                    payload.removed_at = formValues.removedAt;
                }
                if (formValues.note) {
                    payload.note = formValues.note;
                }

                await API.computers.configurations.create(payload);
            }

            await refreshConfigurationListInternal(false);
            clearConfigurationEditorForm();
            setStatus('computer-configuration-status', '構成履歴を保存しました。', 'success');
            setStatus('computer-configuration-list-status', `構成履歴を ${computersState.configurations.rows.length} 件読み込みました。`, 'success');
        } catch (error) {
            setStatus('computer-configuration-status', getApiErrorMessage(error, '構成履歴の保存に失敗しました。'), 'error');
        }
    },
};

export async function initComputers(view) {
    computersState.operatorName = getComputerOperatorName();

    if (view === 'login') {
        const errorEl = document.getElementById('computer-login-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
        if (computersState.operatorName) {
            setInputValue('computer-operator-name', computersState.operatorName);
        }
        return;
    }

    if (view === 'main') {
        renderComputerMainView();
        return;
    }

    try {
        await ensureComputerReferenceData();
    } catch (error) {
        const message = getApiErrorMessage(error, '計算機管理の参照データ取得に失敗しました。');
        if (view === 'parts') {
            setStatus('computer-part-status', message, 'error');
        } else if (view === 'configurations') {
            setStatus('computer-configuration-status', message, 'error');
        }
    }

    if (view === 'details') {
        renderComputerDetailView();
        return;
    }

    if (view === 'parts') {
        renderComputerPartView();
        return;
    }

    if (view === 'configurations') {
        renderPartTypeOptions('');
        renderConfigurationEditor();
        if (computersState.configurations.computerPair) {
            await refreshConfigurationListInternal(false);
        }
    }
}
