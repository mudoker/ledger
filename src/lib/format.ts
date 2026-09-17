import { useBillStore } from "@/store/useBillStore";
import { getCurrencyDecimals, getCurrencyLocale } from "@/lib/currency";

export const getActiveCurrency = (currency?: string): string => {
    if (currency) return currency;
    try {
        return useBillStore.getState()?.currency || 'VND';
    } catch {
        return 'VND';
    }
};

export const formatCurrency = (amount: number, currency?: string): string => {
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    const curr = getActiveCurrency(currency).toUpperCase();
    const decimals = getCurrencyDecimals(curr);
    const locale = getCurrencyLocale(curr);

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: curr,
            minimumFractionDigits: decimals === 0 ? 0 : 2,
            maximumFractionDigits: decimals,
        }).format(safeAmount);
    } catch {
        // Fallback formatting if Intl does not support currency code
        return `${safeAmount.toLocaleString(locale, { maximumFractionDigits: decimals })} ${curr}`;
    }
};

export const formatNumber = (amount: number, currency?: string): string => {
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    const curr = getActiveCurrency(currency).toUpperCase();
    const decimals = getCurrencyDecimals(curr);
    const locale = getCurrencyLocale(curr);

    try {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: safeAmount % 1 === 0 ? 0 : Math.min(2, decimals),
            maximumFractionDigits: decimals,
        }).format(safeAmount);
    } catch {
        return safeAmount.toString();
    }
};

/** Parse a formatted string back to number */
export const parseFormattedNumber = (str: string): number => {
    const cleaned = str.replace(/[^\d.-]/g, '');
    return parseFloat(cleaned) || 0;
};

/**
 * Formats a timestamp into a concise, non-wrapping relative time string.
 * Uses concise wording like "recent" for < 60s, "Xm ago", "Xh ago", "Xd ago".
 */
export const formatConciseRelativeTime = (timestamp: Date | string | number | null | undefined): string => {
    if (!timestamp) return 'recent';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (isNaN(diffMs) || diffMs < 0) {
        return 'recent';
    }

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
        return 'recent';
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
        return `${diffMin}m ago`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) {
        return `${diffWeeks}w ago`;
    }

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
