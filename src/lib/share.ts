export function serializeState(state: any): string {
    const data = {
        p: state.people.map((p: any) => [p.id, p.name, p.sponsorAmount, p.userId || null, p.email || null]),
        i: state.items.map((i: any) => [i.id, i.name, i.price, i.quantity, i.assignments]),
        g: state.globalCharges.map((g: any) => [g.id, g.name, g.amount, g.type]),
        h: state.hostId,
        c: state.currency || 'VND',
        n: state.billName || '',
        l: state.location || '',
    };

    const json = JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(json)));
}

/**
 * Deserializes the bill state from a URL-safe string.
 */
export function deserializeState(encoded: string): any {
    try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const data = JSON.parse(json);

        return {
            people: data.p.map((p: any) => ({
                id: p[0],
                name: p[1],
                sponsorAmount: p[2] || 0,
                userId: p[3] || null,
                email: p[4] || null,
            })),
            items: data.i.map((i: any) => ({ id: i[0], name: i[1], price: i[2], quantity: i[3], assignments: i[4] })),
            globalCharges: data.g.map((g: any) => ({ id: g[0], name: g[1], amount: g[2], type: g[3] })),
            hostId: data.h,
            currency: data.c || 'VND',
            billName: data.n || '',
            location: data.l || '',
        };
    } catch (e) {
        console.error("Failed to deserialize state:", e);
        return null;
    }
}

/**
 * Generates a sharable link for the current state.
 * Shared links are read-only and do not require login to view.
 */
export function generateShareUrl(state: any, readOnly: boolean = true): string {
    const origin = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || 'https://ledger.mudoker.com');
    const url = new URL(origin);

    // Prefer database ID for sharing
    if (state.currentBillId) {
        url.searchParams.set('id', state.currentBillId);
        if (readOnly) {
            url.searchParams.set('share', '1');
        }
        if (state.shareToken) {
            url.searchParams.set('token', state.shareToken);
        }
        return url.toString();
    }

    // Fallback to serialized state (offline support)
    const serialized = serializeState(state);
    url.searchParams.set(readOnly ? 'v' : 'e', serialized);
    return url.toString();
}
