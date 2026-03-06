import fs from 'node:fs';
import path from 'node:path';

export function toDropboxPath(localPath: string): string {
    const absolute = path.resolve(localPath);
    const segments = absolute.split(path.sep);
    const idx = segments.indexOf('Dropbox');
    if (idx === -1) {
        throw new Error(`Cannot find "Dropbox" in path: ${absolute}`);
    }
    const relative = segments.slice(idx + 1);
    if (relative.length === 0) {
        throw new Error('Path points to the Dropbox root, not a file.');
    }
    return '/' + relative.join('/');
}

export function collectFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(full));
        } else if (entry.isFile()) {
            results.push(full);
        }
    }
    return results;
}

export function shortName(filePath: string): string {
    try {
        return toDropboxPath(filePath);
    } catch {
        return path.basename(filePath);
    }
}
