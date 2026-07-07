export const MAINTENANCE_MODE_KEY = 'app:maintenance-mode';

function getStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }

    return window.localStorage;
}

function readState() {
    const storage = getStorage();
    if (!storage) {
        return false;
    }

    try {
        return storage.getItem(MAINTENANCE_MODE_KEY) === 'true';
    } catch (error) {
        console.warn('Failed to read maintenance mode state:', error);
        return false;
    }
}

function writeState(enabled) {
    const storage = getStorage();
    if (!storage) {
        return false;
    }

    try {
        storage.setItem(MAINTENANCE_MODE_KEY, enabled ? 'true' : 'false');
        return enabled;
    } catch (error) {
        console.warn('Failed to write maintenance mode state:', error);
        return false;
    }
}

export function isMaintenanceModeEnabled() {
    return readState();
}

export function setMaintenanceModeEnabled(enabled) {
    return writeState(Boolean(enabled));
}

export function enableMaintenanceMode() {
    return setMaintenanceModeEnabled(true);
}

export function disableMaintenanceMode() {
    return setMaintenanceModeEnabled(false);
}

export function toggleMaintenanceMode() {
    const next = !isMaintenanceModeEnabled();
    return setMaintenanceModeEnabled(next);
}
