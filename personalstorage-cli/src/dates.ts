export function parseDateToEpoch(dateStr: string, mode: 'min' | 'max'): number {
    const parts = dateStr.trim().split(/[-T ]/);
    const year = parseInt(parts[0], 10);
    if (isNaN(year)) return NaN;

    if (parts.length === 1) {
        // YYYY
        return mode === 'min'
            ? new Date(Date.UTC(year, 0, 1)).getTime() / 1000
            : new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime() / 1000;
    }

    // YYYY-Q1 through YYYY-Q4
    const quarterMatch = parts[1].match(/^[Qq]([1-4])$/);
    if (quarterMatch) {
        const q = parseInt(quarterMatch[1], 10);
        const startMonth = (q - 1) * 3;
        if (mode === 'min') {
            return new Date(Date.UTC(year, startMonth, 1)).getTime() / 1000;
        }
        const endMonth = startMonth + 2;
        const lastDay = new Date(Date.UTC(year, endMonth + 1, 0)).getDate();
        return new Date(Date.UTC(year, endMonth, lastDay, 23, 59, 59)).getTime() / 1000;
    }

    const month = parseInt(parts[1], 10) - 1;
    if (parts.length === 2) {
        // YYYY-MM
        if (mode === 'min') {
            return new Date(Date.UTC(year, month, 1)).getTime() / 1000;
        }
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getDate();
        return new Date(Date.UTC(year, month, lastDay, 23, 59, 59)).getTime() / 1000;
    }

    const day = parseInt(parts[2], 10);
    if (parts.length === 3) {
        // YYYY-MM-DD
        if (mode === 'min') {
            return new Date(Date.UTC(year, month, day)).getTime() / 1000;
        }
        return new Date(Date.UTC(year, month, day, 23, 59, 59)).getTime() / 1000;
    }

    // YYYY-MM-DD HH:MM:SS
    const timeParts = parts.slice(3).join(':').split(':');
    const hours = parseInt(timeParts[0], 10) || 0;
    const minutes = parseInt(timeParts[1], 10) || 0;
    const seconds = parseInt(timeParts[2], 10) || 0;
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds)).getTime() / 1000;
}

export function computeDateBounds(dates: string[]): { min_date: number; max_date: number; all_dates: string } | null {
    if (!dates || dates.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;

    for (const d of dates) {
        const lo = parseDateToEpoch(d, 'min');
        const hi = parseDateToEpoch(d, 'max');
        if (isNaN(lo) || isNaN(hi)) continue;
        if (lo < min) min = lo;
        if (hi > max) max = hi;
    }

    if (min === Infinity) return null;

    const normalized = dates.map((d) => {
        const parts = d.trim().split(/[-T ]/);
        return parts.slice(0, 3).join('-');
    });

    return { min_date: min, max_date: max, all_dates: normalized.join(',') };
}
