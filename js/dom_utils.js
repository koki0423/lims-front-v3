export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function toDateInputValue(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function toLocalDateTimeIso(dateInputValue) {
    if (!dateInputValue) {
        return null;
    }

    const normalizedDateValue = dateInputValue instanceof Date
        ? toDateInputValue(dateInputValue)
        : String(dateInputValue);

    const parts = normalizedDateValue.split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    const [year, month, day] = parts;
    const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);

    if (Number.isNaN(localDate.getTime())) {
        return null;
    }

    const offsetMinutes = -localDate.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
    const offsetMins = String(absoluteOffset % 60).padStart(2, '0');

    return `${toDateInputValue(localDate)}T00:00:00${sign}${offsetHours}:${offsetMins}`;
}
