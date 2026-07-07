import { mountDeviceStatusPanel, requestNfcPermission } from '../../js/device_status.js';

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
}
