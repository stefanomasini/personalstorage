import fs from 'node:fs';
import path from 'node:path';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_LOCATION } from '../template.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BOLD = '\x1b[1m';
const CYAN = '\x1b[1;36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

interface RecapOptions {
    markdown?: boolean;
}

export async function recap(localPath: string, options: RecapOptions) {
    const absolute = path.resolve(localPath);
    const stat = fs.statSync(absolute);
    const files = stat.isDirectory() ? collectFiles(absolute) : [absolute];

    if (files.length === 0) {
        console.log('No files found.');
        return;
    }

    const isTTY = process.stderr.isTTY;
    const grouped = new Map<string, { original: string; newName: string }[]>();
    let skipped = 0;
    let fetched = 0;
    let frame = 0;

    let spinnerInterval: ReturnType<typeof setInterval> | undefined;

    function drawProgress(currentFile?: string) {
        if (!isTTY) return;
        const spin = SPINNER[frame++ % SPINNER.length];
        const label = currentFile ? ` ${GRAY}${shortName(currentFile)}${RESET}` : '';
        process.stderr.write(`\r\x1b[K  ${YELLOW}${spin}${RESET} Reading locations ${BOLD}${fetched}${RESET}${GRAY}/${files.length}${RESET}${label}`);
    }

    if (isTTY) {
        spinnerInterval = setInterval(() => drawProgress(), 80);
        drawProgress();
    }

    let currentFile: string | undefined;
    let idx = 0;
    const CONCURRENCY = 5;

    const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
        while (idx < files.length) {
            const file = files[idx++];
            const dropboxPath = toDropboxPath(file);
            currentFile = file;
            drawProgress(file);
            const location = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
            fetched++;
            if (!location || location === '<UNSURE>') {
                skipped++;
                continue;
            }

            const destFolder = path.dirname(location);
            const newName = path.basename(location);
            const original = path.basename(file);

            if (!grouped.has(destFolder)) grouped.set(destFolder, []);
            grouped.get(destFolder)!.push({ original, newName });
        }
    });
    await Promise.all(workers);

    if (spinnerInterval) clearInterval(spinnerInterval);
    if (isTTY) {
        process.stderr.write(`\r\x1b[K  ${GREEN}✓${RESET} Read ${BOLD}${fetched}${RESET} files\n\n`);
    }

    const sortedFolders = [...grouped.keys()].sort();
    const useMarkdown = options.markdown || !process.stdout.isTTY;

    if (sortedFolders.length === 0) {
        console.log(skipped > 0 ? `No decided locations found (${skipped} files without a location).` : 'No files found.');
        return;
    }

    const lines: string[] = [];

    for (const folder of sortedFolders) {
        const entries = grouped.get(folder)!.sort((a, b) => a.newName.localeCompare(b.newName));

        if (useMarkdown) {
            lines.push(`### ${folder}`);
            for (const e of entries) {
                lines.push(e.original === e.newName ? `- ${e.newName}` : `- ${e.original} → ${e.newName}`);
            }
            lines.push('');
        } else {
            lines.push(`${CYAN}${folder}${RESET}`);
            for (const e of entries) {
                if (e.original === e.newName) {
                    lines.push(`  ${e.newName}`);
                } else {
                    lines.push(`  ${e.original} ${GRAY}→${RESET} ${BOLD}${e.newName}${RESET}`);
                }
            }
            lines.push('');
        }
    }

    if (skipped > 0) {
        const msg = `${skipped} file${skipped === 1 ? '' : 's'} without a decided location (skipped)`;
        lines.push(useMarkdown ? `*${msg}*` : `${GRAY}${msg}${RESET}`);
    }

    console.log(lines.join('\n'));
}
