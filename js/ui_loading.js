function resolveElement(target) {
    if (!target) {
        return null;
    }

    if (typeof target === 'string') {
        return document.querySelector(target);
    }

    return target;
}

function resolveElements(targets) {
    if (!targets) {
        return [];
    }

    const source = Array.isArray(targets) ? targets : [targets];
    const elements = [];

    for (let i = 0; i < source.length; i += 1) {
        const target = source[i];
        if (!target) {
            continue;
        }

        if (typeof target === 'string') {
            elements.push(...document.querySelectorAll(target));
            continue;
        }

        if (target instanceof Element) {
            elements.push(target);
        }
    }

    return Array.from(new Set(elements));
}

export function setButtonLoading(target, isLoading, options = {}) {
    const button = resolveElement(target);
    if (!button) {
        return;
    }

    if (isLoading) {
        const depth = Number(button.dataset.uiLoadingDepth || '0');
        if (depth === 0) {
            button.dataset.uiLoadingText = button.textContent;
            button.dataset.uiLoadingDisabled = button.disabled ? '1' : '0';
        }

        button.dataset.uiLoadingDepth = String(depth + 1);
        button.disabled = true;
        if (options.busyText) {
            button.textContent = options.busyText;
        }
        return;
    }

    const nextDepth = Number(button.dataset.uiLoadingDepth || '0') - 1;
    if (nextDepth > 0) {
        button.dataset.uiLoadingDepth = String(nextDepth);
        return;
    }

    if (!button.dataset.uiLoadingDepth) {
        if (options.idleText) {
            button.textContent = options.idleText;
        }
        return;
    }

    button.textContent = options.idleText || button.dataset.uiLoadingText || button.textContent;
    button.disabled = button.dataset.uiLoadingDisabled === '1';

    delete button.dataset.uiLoadingDepth;
    delete button.dataset.uiLoadingText;
    delete button.dataset.uiLoadingDisabled;
}

export function setControlsDisabled(targets, disabled) {
    const elements = resolveElements(targets);
    for (let i = 0; i < elements.length; i += 1) {
        const element = elements[i];
        if (disabled) {
            const depth = Number(element.dataset.uiDisabledDepth || '0');
            if (depth === 0) {
                element.dataset.uiDisabledOriginal = element.disabled ? '1' : '0';
            }
            element.dataset.uiDisabledDepth = String(depth + 1);
            element.disabled = true;
            continue;
        }

        const nextDepth = Number(element.dataset.uiDisabledDepth || '0') - 1;
        if (nextDepth > 0) {
            element.dataset.uiDisabledDepth = String(nextDepth);
            continue;
        }

        if (element.dataset.uiDisabledDepth) {
            element.disabled = element.dataset.uiDisabledOriginal === '1';
            delete element.dataset.uiDisabledDepth;
            delete element.dataset.uiDisabledOriginal;
        }
    }
}

export async function runWithButtonLoading(target, options = {}, task) {
    setButtonLoading(target, true, options);
    try {
        return await task();
    } finally {
        setButtonLoading(target, false, options);
    }
}
