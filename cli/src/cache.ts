import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.cache', 'personalstorage');
const TTL_MS = 60_000;

interface CacheEntry<T> {
    timestamp: number;
    data: T;
}

function cachePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
    return join(CACHE_DIR, `${hash}.json`);
}

export function getCached<T>(key: string): T | null {
    try {
        const raw = readFileSync(cachePath(key), 'utf-8');
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - entry.timestamp < TTL_MS) return entry.data;
    } catch {}
    return null;
}

export function setCached<T>(key: string, data: T): void {
    try {
        mkdirSync(CACHE_DIR, { recursive: true });
        const entry: CacheEntry<T> = { timestamp: Date.now(), data };
        const dest = cachePath(key);
        const tmp = `${dest}.tmp.${process.pid}`;
        writeFileSync(tmp, JSON.stringify(entry));
        renameSync(tmp, dest);
    } catch {}
}
