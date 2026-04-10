function inferTotalItems(response, offset, itemsPerPage, receivedCount) {
    const rawTotal = Number(response?.total);
    if (Number.isFinite(rawTotal) && rawTotal >= 0) {
        return rawTotal;
    }

    const nextOffset = Number(response?.next_offset);
    if (Number.isFinite(nextOffset) && nextOffset > offset) {
        return Math.max(nextOffset + itemsPerPage, offset + receivedCount);
    }

    return offset + receivedCount;
}

export function normalizePageResponse(response, { page = 1, itemsPerPage = 20, localFilter = null } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeItemsPerPage = Math.max(1, Number(itemsPerPage) || 20);
    const offset = (safePage - 1) * safeItemsPerPage;

    if (Array.isArray(response)) {
        const source = typeof localFilter === 'function' ? response.filter(localFilter) : response;
        const totalItems = source.length;

        return {
            items: source.slice(offset, offset + safeItemsPerPage),
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / safeItemsPerPage)),
            mode: 'client'
        };
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    const totalItems = inferTotalItems(response, offset, safeItemsPerPage, items.length);

    return {
        items,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / safeItemsPerPage)),
        mode: 'server'
    };
}
