import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_LOCATION } from '../template.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BOLD = '\x1b[1m';
const CYAN = '\x1b[1;36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const READ_CONCURRENCY = 20;
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 500;

interface MoveEntry {
    from_path: string;
    to_path: string;
}

interface RecapOptions {
    markdown?: boolean;
    move?: boolean;
}

interface ReadResult {
    grouped: Map<string, { original: string; newName: string }[]>;
    moveEntries: MoveEntry[];
    skipped: number;
}

async function readLocations(files: string[], collectMoveEntries: boolean): Promise<ReadResult> {
    const isTTY = process.stderr.isTTY;
    const grouped = new Map<string, { original: string; newName: string }[]>();
    const moveEntries: MoveEntry[] = [];
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

    let idx = 0;
    const workers = Array.from({ length: Math.min(READ_CONCURRENCY, files.length) }, async () => {
        while (idx < files.length) {
            const file = files[idx++];
            const dropboxPath = toDropboxPath(file);
            drawProgress(file);
            const location = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
            fetched++;
            if (!location || location === '<UNSURE>') {
                skipped++;
                continue;
            }

            if (collectMoveEntries) {
                moveEntries.push({ from_path: dropboxPath, to_path: location });
            } else {
                const destFolder = path.dirname(location);
                const newName = path.basename(location);
                const original = path.basename(file);
                if (!grouped.has(destFolder)) grouped.set(destFolder, []);
                grouped.get(destFolder)!.push({ original, newName });
            }
        }
    });
    await Promise.all(workers);

    if (spinnerInterval) clearInterval(spinnerInterval);
    if (isTTY) {
        if (collectMoveEntries) {
            process.stderr.write(`\r\x1b[K  ${GREEN}✓${RESET} Read ${BOLD}${fetched}${RESET} files — ${BOLD}${moveEntries.length}${RESET} to move`);
            if (skipped > 0) process.stderr.write(` ${GRAY}(${skipped} skipped)${RESET}`);
            process.stderr.write('\n');
        } else {
            process.stderr.write(`\r\x1b[K  ${GREEN}✓${RESET} Read ${BOLD}${fetched}${RESET} files\n\n`);
        }
    }

    return { grouped, moveEntries, skipped };
}

async function moveBatched(entries: MoveEntry[]) {
    const isTTY = process.stderr.isTTY;
    const dbx = getClient();
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
    let moved = 0;
    let errors = 0;
    let frame = 0;

    for (let b = 0; b < totalBatches; b++) {
        const batch = entries.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        if (isTTY) {
            const spin = SPINNER[frame++ % SPINNER.length];
            process.stderr.write(`\r\x1b[K  ${YELLOW}${spin}${RESET} Moving batch ${BOLD}${b + 1}${RESET}${GRAY}/${totalBatches}${RESET} (${batch.length} files)`);
        }

        const response = await dbx.filesMoveBatchV2({ entries: batch });
        let jobId = response.result['.tag'] === 'async_job_id' ? (response.result as any).async_job_id as string : undefined;
        let completedEntries = response.result['.tag'] === 'complete' ? (response.result as any).entries : undefined;

        while (!completedEntries) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            if (isTTY) {
                const spin = SPINNER[frame++ % SPINNER.length];
                process.stderr.write(`\r\x1b[K  ${YELLOW}${spin}${RESET} Moving batch ${BOLD}${b + 1}${RESET}${GRAY}/${totalBatches}${RESET} (waiting for Dropbox)`);
            }
            const poll = await dbx.filesMoveBatchCheckV2({ async_job_id: jobId! });
            if (poll.result['.tag'] === 'complete') {
                completedEntries = (poll.result as any).entries;
            }
        }

        for (const entry of completedEntries) {
            if (entry['.tag'] === 'success') moved++;
            else errors++;
        }
    }

    if (isTTY) {
        process.stderr.write(`\r\x1b[K  ${GREEN}✓${RESET} Moved ${BOLD}${moved}${RESET} files`);
        if (errors > 0) process.stderr.write(` ${RED}(${errors} failed)${RESET}`);
        process.stderr.write('\n');
    }
}

export async function recap(localPath: string, options: RecapOptions) {
    const absolute = path.resolve(localPath);
    const stat = fs.statSync(absolute);
    const files = stat.isDirectory() ? collectFiles(absolute) : [absolute];

    if (files.length === 0) {
        console.log('No files found.');
        return;
    }

    if (options.move) {
        const { moveEntries } = await readLocations(files, true);
        if (moveEntries.length > 0) await moveBatched(moveEntries);
        return;
    }

    const { grouped, skipped } = await readLocations(files, false);

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
