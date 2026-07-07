const VIEW_STATE_PREFIX = 'view-state:';

function getStorageKey(key) {
    return `${VIEW_STATE_PREFIX}${key}`;
}

export function loadViewState(key, fallback = {}) {
    if (typeof sessionStorage === 'undefined') {
        return { ...fallback };
    }

    try {
        const raw = sessionStorage.getItem(getStorageKey(key));
        if (!raw) {
            return { ...fallback };
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ...fallback };
        }

        return {
            ...fallback,
            ...parsed
        };
    } catch (error) {
        console.warn('loadViewState failed:', key, error);
        return { ...fallback };
    }
}

export function saveViewState(key, value) {
    if (typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        sessionStorage.setItem(getStorageKey(key), JSON.stringify(value || {}));
    } catch (error) {
        console.warn('saveViewState failed:', key, error);
    }
}

export function clearViewState(key) {
    if (typeof sessionStorage === 'undefined') {
        return;
    }

    try {
        sessionStorage.removeItem(getStorageKey(key));
    } catch (error) {
        console.warn('clearViewState failed:', key, error);
    }
}
