const NFC_VENDOR_ID = 1356;
const NFC_DEVICE_NAMES = new Map([
    [1729, 'RC-S380/S'],
    [1731, 'RC-S380/P'],
    [3528, 'RC-S300/S'],
    [3529, 'RC-S300/P'],
    [3471, 'RC-S660']
]);

const DEVICE_LABELS = {
    tepra: 'TEPRA',
    nfc: 'NFCリーダ'
};

let usbEventBound = false;

function getNfcRequestFilters() {
    return Array.from(NFC_DEVICE_NAMES.keys()).map((productId) => {
        return {
            vendorId: NFC_VENDOR_ID,
            productId
        };
    });
}

function setDeviceStatus(device, state, text, title = '') {
    const item = document.querySelector(`[data-device-status="${device}"]`);
    const label = document.querySelector(`[data-device-label="${device}"]`);

    if (!item || !label) {
        return;
    }

    item.dataset.state = state;
    item.title = title;
    label.textContent = text;
}

function setDeviceChecking(device) {
    setDeviceStatus(device, 'checking', `${DEVICE_LABELS[device]} 確認中`);
}

function getTepraDisplayName(printer) {
    return printer?.modelName || printer?.printerName || '';
}

async function checkTepraStatus() {
    if (!window.TepraPrint || !window.TepraPrintError) {
        return {
            connected: false,
            text: DEVICE_LABELS.tepra,
            message: 'TepraPrintライブラリが読み込まれていません'
        };
    }

    const printerResult = await window.TepraPrint.createPrinter();
    if (printerResult.errorCode !== window.TepraPrintError.SUCCESS) {
        return {
            connected: false,
            text: DEVICE_LABELS.tepra,
            message: `プリンタの取得に失敗しました: errorCode=${printerResult.errorCode}`
        };
    }

    const printer = printerResult.printer;
    const displayName = getTepraDisplayName(printer);
    const onlineResult = await window.TepraPrint.checkPrinterOnline(printer.printerName);

    if (onlineResult.errorCode !== window.TepraPrintError.SUCCESS) {
        return {
            connected: false,
            text: displayName ? `${DEVICE_LABELS.tepra} ${displayName}` : DEVICE_LABELS.tepra,
            message: `プリンタ状態の確認に失敗しました: errorCode=${onlineResult.errorCode}`
        };
    }

    return {
        connected: Boolean(onlineResult.isOnline),
        text: displayName ? `${DEVICE_LABELS.tepra} ${displayName}` : DEVICE_LABELS.tepra,
        message: onlineResult.isOnline ? 'オンライン' : 'オフライン'
    };
}

async function checkNfcStatus() {
    if (!navigator.usb || typeof navigator.usb.getDevices !== 'function') {
        return {
            connected: false,
            text: DEVICE_LABELS.nfc,
            message: 'このブラウザはWebUSBに対応していません'
        };
    }

    const devices = await navigator.usb.getDevices();
    const device = devices.find((entry) => {
        return entry.vendorId === NFC_VENDOR_ID && NFC_DEVICE_NAMES.has(entry.productId);
    });

    if (!device) {
        return {
            connected: false,
            text: DEVICE_LABELS.nfc,
            message: '許可済みのNFCリーダが見つかりません'
        };
    }

    return {
        connected: true,
        text: DEVICE_LABELS.nfc,
        message: NFC_DEVICE_NAMES.get(device.productId) || device.productName || '接続済み'
    };
}

async function requestNfcPermission() {
    if (!navigator.usb || typeof navigator.usb.requestDevice !== 'function') {
        setDeviceStatus(
            'nfc',
            'disconnected',
            DEVICE_LABELS.nfc,
            'このブラウザはWebUSBに対応していません'
        );
        return;
    }

    setDeviceChecking('nfc');

    try {
        const device = await navigator.usb.requestDevice({
            filters: getNfcRequestFilters()
        });
        const modelName = NFC_DEVICE_NAMES.get(device.productId) || device.productName || '接続済み';

        setDeviceStatus(
            'nfc',
            'connected',
            DEVICE_LABELS.nfc,
            modelName
        );
    } catch (error) {
        setDeviceStatus(
            'nfc',
            'disconnected',
            DEVICE_LABELS.nfc,
            error instanceof Error ? error.message : String(error)
        );
    }
}

async function refreshTepraStatus() {
    try {
        const result = await checkTepraStatus();
        setDeviceStatus(
            'tepra',
            result.connected ? 'connected' : 'disconnected',
            result.text,
            result.message
        );
    } catch (error) {
        setDeviceStatus(
            'tepra',
            'disconnected',
            DEVICE_LABELS.tepra,
            error instanceof Error ? error.message : String(error)
        );
    }
}

async function refreshNfcStatus() {
    try {
        const result = await checkNfcStatus();
        setDeviceStatus(
            'nfc',
            result.connected ? 'connected' : 'disconnected',
            result.text,
            result.message
        );
    } catch (error) {
        setDeviceStatus(
            'nfc',
            'disconnected',
            DEVICE_LABELS.nfc,
            error instanceof Error ? error.message : String(error)
        );
    }
}

function bindUsbDeviceEvents() {
    if (usbEventBound || !navigator.usb || typeof navigator.usb.addEventListener !== 'function') {
        return;
    }

    navigator.usb.addEventListener('connect', refreshNfcStatus);
    navigator.usb.addEventListener('disconnect', refreshNfcStatus);
    usbEventBound = true;
}

window.MainMenuController = {
    requestNfcPermission
};

export async function initMainMenu() {
    setDeviceChecking('tepra');
    setDeviceChecking('nfc');
    bindUsbDeviceEvents();

    await Promise.all([
        refreshTepraStatus(),
        refreshNfcStatus()
    ]);
}
