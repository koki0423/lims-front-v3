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

const panelRegistry = new Map();
let usbEventBound = false;

function getNfcRequestFilters() {
    return Array.from(NFC_DEVICE_NAMES.keys()).map((productId) => {
        return {
            vendorId: NFC_VENDOR_ID,
            productId
        };
    });
}

function getPanelConfig(containerId) {
    return panelRegistry.get(containerId) || null;
}

function getPanelElement(containerId) {
    return document.getElementById(containerId);
}

function setDeviceStatus(containerId, device, state, text, title = '') {
    const container = getPanelElement(containerId);
    if (!container) {
        return;
    }

    const item = container.querySelector(`[data-device-status="${device}"]`);
    const label = container.querySelector(`[data-device-label="${device}"]`);

    if (!item || !label) {
        return;
    }

    item.dataset.state = state;
    item.title = title;
    label.textContent = text;
}

function setDeviceChecking(containerId, device) {
    setDeviceStatus(containerId, device, 'checking', `${DEVICE_LABELS[device]} 確認中`);
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

function buildDeviceStatusPanelHtml(title, devices) {
    const items = devices.map((device) => {
        const requestButton = device === 'nfc'
            ? `
                <button type="button" class="device-status-action" data-device-action="nfc">
                    接続確認
                </button>
            `
            : '';

        return `
            <div class="device-status-item" data-device-status="${device}" data-state="checking">
                <span class="device-status-dot" aria-hidden="true"></span>
                <span class="device-status-text" data-device-label="${device}">${DEVICE_LABELS[device]} 確認中</span>
                ${requestButton}
            </div>
        `;
    }).join('');

    return `
        <div class="device-status-card" aria-label="${title}">
            <div class="device-status-title">${title}</div>
            <div class="device-status-list">
                ${items}
            </div>
        </div>
    `;
}

function bindPanelEvents(containerId) {
    const container = getPanelElement(containerId);
    if (!container) {
        return;
    }

    const nfcButton = container.querySelector('[data-device-action="nfc"]');
    if (nfcButton && !nfcButton.dataset.bound) {
        nfcButton.dataset.bound = '1';
        nfcButton.addEventListener('click', () => {
            requestNfcPermission(containerId);
        });
    }
}

export async function refreshDeviceStatusPanel(containerId) {
    const config = getPanelConfig(containerId);
    if (!config) {
        return;
    }

    if (config.devices.includes('tepra')) {
        setDeviceChecking(containerId, 'tepra');
        try {
            const result = await checkTepraStatus();
            setDeviceStatus(
                containerId,
                'tepra',
                result.connected ? 'connected' : 'disconnected',
                result.text,
                result.message
            );
        } catch (error) {
            setDeviceStatus(
                containerId,
                'tepra',
                'disconnected',
                DEVICE_LABELS.tepra,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    if (config.devices.includes('nfc')) {
        setDeviceChecking(containerId, 'nfc');
        try {
            const result = await checkNfcStatus();
            setDeviceStatus(
                containerId,
                'nfc',
                result.connected ? 'connected' : 'disconnected',
                result.text,
                result.message
            );
        } catch (error) {
            setDeviceStatus(
                containerId,
                'nfc',
                'disconnected',
                DEVICE_LABELS.nfc,
                error instanceof Error ? error.message : String(error)
            );
        }
    }
}

export async function refreshAllDeviceStatusPanels() {
    const ids = Array.from(panelRegistry.keys());
    await Promise.all(ids.map((containerId) => refreshDeviceStatusPanel(containerId)));
}

function bindUsbDeviceEvents() {
    if (usbEventBound || !navigator.usb || typeof navigator.usb.addEventListener !== 'function') {
        return;
    }

    navigator.usb.addEventListener('connect', () => {
        refreshAllDeviceStatusPanels();
    });
    navigator.usb.addEventListener('disconnect', () => {
        refreshAllDeviceStatusPanels();
    });
    usbEventBound = true;
}

export async function requestNfcPermission(containerId = null) {
    const ids = containerId ? [containerId] : Array.from(panelRegistry.keys());
    ids.forEach((id) => {
        const config = getPanelConfig(id);
        if (config?.devices.includes('nfc')) {
            setDeviceChecking(id, 'nfc');
        }
    });

    if (!navigator.usb || typeof navigator.usb.requestDevice !== 'function') {
        ids.forEach((id) => {
            const config = getPanelConfig(id);
            if (config?.devices.includes('nfc')) {
                setDeviceStatus(id, 'nfc', 'disconnected', DEVICE_LABELS.nfc, 'このブラウザはWebUSBに対応していません');
            }
        });
        return;
    }

    try {
        await navigator.usb.requestDevice({
            filters: getNfcRequestFilters()
        });
    } catch (error) {
        ids.forEach((id) => {
            const config = getPanelConfig(id);
            if (config?.devices.includes('nfc')) {
                setDeviceStatus(
                    id,
                    'nfc',
                    'disconnected',
                    DEVICE_LABELS.nfc,
                    error instanceof Error ? error.message : String(error)
                );
            }
        });
        return;
    }

    await refreshAllDeviceStatusPanels();
}

export async function mountDeviceStatusPanel(containerId, options = {}) {
    const container = getPanelElement(containerId);
    if (!container) {
        return;
    }

    const devices = Array.isArray(options.devices) && options.devices.length > 0
        ? options.devices
        : ['tepra', 'nfc'];
    const title = options.title || '接続状態';

    panelRegistry.set(containerId, { devices, title });
    container.innerHTML = buildDeviceStatusPanelHtml(title, devices);

    bindPanelEvents(containerId);
    bindUsbDeviceEvents();
    await refreshDeviceStatusPanel(containerId);
}
