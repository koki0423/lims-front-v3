let activeDialog = null;

function ensureDialog() {
    let root = document.getElementById('confirm-dialog-root');
    if (root) {
        return root;
    }

    root = document.createElement('div');
    root.id = 'confirm-dialog-root';
    root.className = 'confirm-dialog-overlay';
    root.hidden = true;
    root.innerHTML = `
        <div class="confirm-dialog-window" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
            <h3 id="confirm-dialog-title" class="confirm-dialog-title"></h3>
            <p id="confirm-dialog-message" class="confirm-dialog-message"></p>
            <div class="confirm-dialog-actions">
                <button type="button" id="confirm-dialog-cancel" class="back-btn">キャンセル</button>
                <button type="button" id="confirm-dialog-confirm" class="primary-btn confirm-dialog-confirm">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(root);

    root.addEventListener('click', (event) => {
        if (event.target === root) {
            closeDialog(false);
        }
    });

    root.querySelector('#confirm-dialog-cancel')?.addEventListener('click', () => {
        closeDialog(false);
    });

    root.querySelector('#confirm-dialog-confirm')?.addEventListener('click', () => {
        closeDialog(true);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeDialog) {
            closeDialog(false);
        }
    });

    return root;
}

function closeDialog(result) {
    if (!activeDialog) {
        return;
    }

    const { root, resolve, returnFocusTo } = activeDialog;
    root.hidden = true;
    document.body.classList.remove('dialog-open');
    activeDialog = null;
    if (returnFocusTo instanceof Element) {
        window.setTimeout(() => {
            returnFocusTo.focus();
        }, 0);
    }
    resolve(Boolean(result));
}

export function confirmAction(options = {}) {
    if (activeDialog) {
        closeDialog(false);
    }

    const root = ensureDialog();
    const titleEl = root.querySelector('#confirm-dialog-title');
    const messageEl = root.querySelector('#confirm-dialog-message');
    const confirmBtn = root.querySelector('#confirm-dialog-confirm');
    const cancelBtn = root.querySelector('#confirm-dialog-cancel');
    const activeElement = document.activeElement;

    if (titleEl) {
        titleEl.textContent = options.title || '確認';
    }
    if (messageEl) {
        messageEl.textContent = options.message || '';
    }
    if (confirmBtn) {
        confirmBtn.textContent = options.confirmLabel || 'OK';
        confirmBtn.dataset.tone = options.tone || 'primary';
    }
    if (cancelBtn) {
        cancelBtn.textContent = options.cancelLabel || 'キャンセル';
    }

    root.hidden = false;
    document.body.classList.add('dialog-open');

    return new Promise((resolve) => {
        activeDialog = {
            root,
            resolve,
            returnFocusTo: activeElement instanceof Element ? activeElement : null
        };
        window.setTimeout(() => {
            const preferred = options.defaultAction === 'cancel' ? cancelBtn : confirmBtn;
            preferred?.focus();
        }, 0);
    });
}
