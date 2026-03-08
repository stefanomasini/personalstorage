import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addUsage, formatUsage, type UsageStats } from './ai-adapter.js';

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const MAX_VISIBLE = 10;
const MAX_LABEL_LENGTH = 80;

function truncateLabel(label: string): string {
    if (label.length <= MAX_LABEL_LENGTH) return label;
    return '…' + label.slice(-(MAX_LABEL_LENGTH - 1));
}

export type ItemState = 'waiting' | 'processing' | 'done' | 'skipped' | 'error';

export interface ProcessResult {
    state: 'done' | 'skipped' | 'error';
    usage?: UsageStats;
    error?: string;
}

interface Counts {
    done: number;
    skipped: number;
    errors: number;
    total: number;
}

function renderUI(
    states: Map<string, ItemState>,
    statuses: Map<string, string>,
    items: string[],
    spinnerFrame: number,
    counts: Counts,
    labelFn: (item: string) => string,
    usages: Map<string, UsageStats>,
    lastError?: { key: string; message: string },
) {
    const lines: string[] = [];
    const spin = SPINNER[spinnerFrame % SPINNER.length];

    const doneItems = items.filter((f) => states.get(f) === 'done' || states.get(f) === 'skipped');
    const processingItems = items.filter((f) => states.get(f) === 'processing');
    const errorItems = items.filter((f) => states.get(f) === 'error');
    const waitingItems = items.filter((f) => states.get(f) === 'waiting');

    const visibleDone = doneItems.slice(-MAX_VISIBLE);
    if (doneItems.length > MAX_VISIBLE) {
        lines.push(`${GRAY}  ... ${doneItems.length - MAX_VISIBLE} more completed${RESET}`);
    }
    for (const f of visibleDone) {
        const usage = usages.get(f);
        const detail = states.get(f) === 'skipped' ? 'skipped' : usage ? `$${usage.totalCost.toFixed(4)}` : 'done';
        lines.push(`${GREEN}  ✓ ${truncateLabel(labelFn(f))} ${GRAY}(${detail})${RESET}`);
    }

    const visibleErrors = errorItems.slice(0, MAX_VISIBLE);
    for (const f of visibleErrors) {
        lines.push(`${RED}  ✗ ${truncateLabel(labelFn(f))}${RESET}`);
    }
    if (errorItems.length > MAX_VISIBLE) {
        lines.push(`${RED}  ... ${errorItems.length - MAX_VISIBLE} more errors${RESET}`);
    }

    const visibleProcessing = processingItems.slice(0, MAX_VISIBLE);
    for (const f of visibleProcessing) {
        const status = statuses.get(f);
        const suffix = status ? `  ${GRAY}${status}${RESET}` : '';
        lines.push(`${YELLOW}  ${spin} ${truncateLabel(labelFn(f))}${suffix}`);
    }
    if (processingItems.length > MAX_VISIBLE) {
        lines.push(`${YELLOW}  ... ${processingItems.length - MAX_VISIBLE} more in progress${RESET}`);
    }

    const visibleWaiting = waitingItems.slice(0, MAX_VISIBLE);
    for (const f of visibleWaiting) {
        lines.push(`${GRAY}  · ${truncateLabel(labelFn(f))}${RESET}`);
    }
    if (waitingItems.length > MAX_VISIBLE) {
        lines.push(`${GRAY}  ... ${waitingItems.length - MAX_VISIBLE} more${RESET}`);
    }

    const completed = counts.done + counts.skipped + counts.errors;
    lines.push('');
    lines.push(`${BOLD}  ${completed}/${counts.total}${RESET}${GRAY} — ${counts.done} analyzed, ${counts.skipped} skipped, ${counts.errors} errors${RESET}`);

    if (lastError) {
        const short = lastError.message.length > 120 ? lastError.message.slice(0, 120) + '…' : lastError.message;
        lines.push(`${RED}  latest error: ${truncateLabel(labelFn(lastError.key))}: ${short}${RESET}`);
    }

    return lines;
}

export interface RunOptions<T> {
    items: T[];
    /** Unique key for each item (used internally for state tracking). */
    keyFn: (item: T) => string;
    /** Display label shown in the progress UI. */
    labelFn: (item: T) => string;
    /** Process a single item. Return the outcome. Call setStatus to update the step label. */
    processItem: (item: T, setStatus: (status: string) => void) => Promise<ProcessResult>;
    concurrency: number;
}

export async function runWithProgress<T>(opts: RunOptions<T>): Promise<void> {
    const { items, keyFn, labelFn, processItem, concurrency } = opts;

    const states = new Map<string, ItemState>();
    const statuses = new Map<string, string>();
    const usages = new Map<string, UsageStats>();
    const keyToItem = new Map<string, T>();
    const keys: string[] = [];

    for (const item of items) {
        const key = keyFn(item);
        keys.push(key);
        states.set(key, 'waiting');
        keyToItem.set(key, item);
    }

    const counts: Counts = { done: 0, skipped: 0, errors: 0, total: items.length };
    const errorLog: { key: string; message: string }[] = [];
    let totalUsage: UsageStats | undefined;
    let processedWithUsage = 0;
    let prevLineCount = 0;
    let spinnerFrame = 0;

    const labelByKey = (key: string) => labelFn(keyToItem.get(key)!);

    function physicalRows(lines: string[]): number {
        const cols = process.stderr.columns || 80;
        let rows = 0;
        for (const line of lines) {
            // Strip ANSI escape sequences to get visible length
            const visible = line.replace(/\x1b\[[0-9;]*m/g, '').length;
            rows += Math.max(1, Math.ceil(visible / cols));
        }
        return rows;
    }

    function draw() {
        const lastError = errorLog.length > 0 ? errorLog[errorLog.length - 1] : undefined;
        const lines = renderUI(states, statuses, keys, spinnerFrame, counts, labelByKey, usages, lastError);
        if (prevLineCount > 0) {
            process.stderr.write(`\x1b[${prevLineCount}A\x1b[J`);
        }
        process.stderr.write(lines.join('\n') + '\n');
        prevLineCount = physicalRows(lines);
    }

    const renderInterval = setInterval(() => {
        spinnerFrame++;
        draw();
    }, 100);

    draw();

    let stopping = false;
    let sigintCount = 0;
    const onSigint = () => {
        sigintCount++;
        if (sigintCount >= 2) process.exit(1);
        stopping = true;
    };
    process.on('SIGINT', onSigint);

    let i = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (i < items.length) {
            if (stopping) break;
            const item = items[i++];
            const key = keyFn(item);

            states.set(key, 'processing');

            const result = await processItem(item, (status) => { statuses.set(key, status); });
            states.set(key, result.state);
            if (result.state === 'error') {
                counts.errors++;
                errorLog.push({ key, message: result.error ?? 'unknown error' });
            } else {
                counts[result.state]++;
            }
            if (result.usage) {
                usages.set(key, result.usage);
                totalUsage = totalUsage ? addUsage(totalUsage, result.usage) : result.usage;
                processedWithUsage++;
            }
        }
    });
    await Promise.all(workers);

    process.removeListener('SIGINT', onSigint);

    if (stopping) {
        // Adjust total to exclude items that were never picked up
        counts.total = counts.done + counts.skipped + counts.errors;
        for (const key of keys) {
            if (states.get(key) === 'waiting') states.set(key, 'skipped');
        }
    }

    clearInterval(renderInterval);
    draw();

    if (totalUsage && processedWithUsage > 0) {
        const avg = `$${(totalUsage.totalCost / processedWithUsage).toFixed(6)}/file avg`;
        process.stderr.write(`\n  ${BOLD}Cost:${RESET} ${formatUsage(totalUsage)} (${avg})\n`);
    }

    if (errorLog.length > 0) {
        const grouped = new Map<string, number>();
        for (const { message } of errorLog) {
            grouped.set(message, (grouped.get(message) ?? 0) + 1);
        }
        const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);

        process.stderr.write(`\n  ${RED}${BOLD}Errors (${errorLog.length}):${RESET}\n`);
        for (const [msg, count] of sorted) {
            const short = msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
            process.stderr.write(`  ${RED}  ${short}${count > 1 ? ` (×${count})` : ''}${RESET}\n`);
        }

        const logFile = path.join(os.tmpdir(), `storage-cli-errors-${new Date().toISOString().slice(0, 10)}.log`);
        const logLines = errorLog.map((e) => `${labelByKey(e.key)}\t${e.message}`).join('\n');
        fs.writeFileSync(logFile, logLines + '\n');
        process.stderr.write(`  ${GRAY}Full log: ${logFile}${RESET}\n`);
    }
}
