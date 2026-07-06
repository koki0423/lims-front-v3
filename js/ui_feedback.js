function getFeedbackMessage(error, fallbackMessage) {
    return (
        error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.response?.data?.error
        || (error instanceof Error ? error.message : '')
        || fallbackMessage
    );
}

function findFieldFeedbackHost(input) {
    if (!input) {
        return null;
    }

    return input.closest('.input-with-btn') || input;
}

function getFieldFeedbackElement(input, createIfMissing = false) {
    const host = findFieldFeedbackHost(input);
    if (!host || !host.parentElement) {
        return null;
    }

    let message = host.parentElement.querySelector(`.field-feedback[data-field-feedback-for="${input.id || input.name || ''}"]`);
    if (message || !createIfMissing) {
        return message;
    }

    message = document.createElement('p');
    message.className = 'field-feedback';
    message.dataset.fieldFeedbackFor = input.id || input.name || '';
    host.insertAdjacentElement('afterend', message);
    return message;
}

export function showPageFeedback(targetId, message, tone = 'info') {
    const target = document.getElementById(targetId);
    if (!target) {
        return;
    }

    target.hidden = false;
    target.className = `batch-status-banner page-feedback ${tone}`;
    target.textContent = message;
}

export function hidePageFeedback(targetId) {
    const target = document.getElementById(targetId);
    if (!target) {
        return;
    }

    target.hidden = true;
    target.textContent = '';
}

export function showApiPageFeedback(targetId, error, fallbackMessage, tone = 'error') {
    showPageFeedback(targetId, getFeedbackMessage(error, fallbackMessage), tone);
}

export function setFieldFeedback(input, message) {
    if (!input) {
        return;
    }

    input.classList.add('field-invalid');
    input.setAttribute('aria-invalid', 'true');

    const feedback = getFieldFeedbackElement(input, true);
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
}

export function clearFieldFeedback(input) {
    if (!input) {
        return;
    }

    input.classList.remove('field-invalid');
    input.removeAttribute('aria-invalid');

    const feedback = getFieldFeedbackElement(input, false);
    if (feedback) {
        feedback.textContent = '';
    }
}

export function clearFeedbackInContainer(container) {
    if (!container) {
        return;
    }

    container.querySelectorAll('.field-invalid').forEach((input) => {
        input.classList.remove('field-invalid');
        input.removeAttribute('aria-invalid');
    });

    container.querySelectorAll('.field-feedback').forEach((node) => {
        node.textContent = '';
    });
}

export { getFeedbackMessage };
