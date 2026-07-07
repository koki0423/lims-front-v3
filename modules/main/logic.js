import { mountDeviceStatusPanel, requestNfcPermission } from '../../js/device_status.js';
import { hidePageFeedback, showPageFeedback } from '../../js/ui_feedback.js';
import { isMaintenanceModeEnabled, MAINTENANCE_MODE_KEY } from '../../js/maintenance_mode.js';

let maintenanceStorageListenerBound = false;

function setElementDisabledState(elements, isDisabled) {
    elements.forEach((element) => {
        if (!element) {
            return;
        }

        element.disabled = isDisabled;
        element.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    });
}

function syncMainMenuMaintenanceState() {
    const isMaintenanceMode = isMaintenanceModeEnabled();
    const blockedButtons = Array.from(document.querySelectorAll('[data-maintenance-blocked="true"]'));
    const deviceActionButtons = Array.from(document.querySelectorAll('#main-device-status [data-device-action]'));

    setElementDisabledState(blockedButtons, isMaintenanceMode);
    setElementDisabledState(deviceActionButtons, isMaintenanceMode);

    if (isMaintenanceMode) {
        showPageFeedback(
            'main-maintenance-feedback',
            'メンテナンスモード中です。管理者ログイン以外の操作は利用できません。',
            'warning'
        );
        return;
    }

    hidePageFeedback('main-maintenance-feedback');
}

function bindMaintenanceStorageListener() {
    if (maintenanceStorageListenerBound || typeof window === 'undefined') {
        return;
    }

    window.addEventListener('storage', (event) => {
        if (event.key && event.key !== MAINTENANCE_MODE_KEY) {
            return;
        }

        syncMainMenuMaintenanceState();
    });

    maintenanceStorageListenerBound = true;
}

window.MainMenuController = {
    requestNfcPermission() {
        return requestNfcPermission('main-device-status');
    }
};

export async function initMainMenu() {
    await mountDeviceStatusPanel('main-device-status', {
        title: '接続状態',
        devices: ['tepra', 'nfc']
    });

    syncMainMenuMaintenanceState();
    bindMaintenanceStorageListener();
}
