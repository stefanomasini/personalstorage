const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const MAX_VISIBLE = 10;

export type ItemState = 'waiting' | 'processing' | 'done' | 'skipped' | 'error';

export interface ProcessResult {
    state: 'done' | 'skipped' | 'error';
}

interface Counts {
    done: number;
    skipped: number;
    errors: number;
    total: number;
}

function renderUI(
    states: Map<string, ItemState>,
    items: string[],
    spinnerFrame: number,
    counts: Counts,
    labelFn: (item: string) => string,
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
        const label = states.get(f) === 'skipped' ? 'skipped' : 'done';
        lines.push(`${GREEN}  ✓ ${labelFn(f)} ${GRAY}(${label})${RESET}`);
    }

    for (const f of errorItems) {
        lines.push(`${RED}  ✗ ${labelFn(f)}${RESET}`);
    }

    for (const f of processingItems) {
        lines.push(`${YELLOW}  ${spin} ${labelFn(f)}${RESET}`);
    }

    const visibleWaiting = waitingItems.slice(0, MAX_VISIBLE);
    for (const f of visibleWaiting) {
        lines.push(`${GRAY}  · ${labelFn(f)}${RESET}`);
    }
    if (waitingItems.length > MAX_VISIBLE) {
        lines.push(`${GRAY}  ... ${waitingItems.length - MAX_VISIBLE} more${RESET}`);
    }

    const completed = counts.done + counts.skipped + counts.errors;
    lines.push('');
    lines.push(`${BOLD}  ${completed}/${counts.total}${RESET}${GRAY} — ${counts.done} analyzed, ${counts.skipped} skipped, ${counts.errors} errors${RESET}`);

    return lines;
}

export interface RunOptions<T> {
    items: T[];
    /** Unique key for each item (used internally for state tracking). */
    keyFn: (item: T) => string;
    /** Display label shown in the progress UI. */
    labelFn: (item: T) => string;
    /** Process a single item. Return the outcome. */
    processItem: (item: T) => Promise<ProcessResult>;
    concurrency: number;
}

export async function runWithProgress<T>(opts: RunOptions<T>): Promise<void> {
    const { items, keyFn, labelFn, processItem, concurrency } = opts;

    const states = new Map<string, ItemState>();
    const keyToItem = new Map<string, T>();
    const keys: string[] = [];

    for (const item of items) {
        const key = keyFn(item);
        keys.push(key);
        states.set(key, 'waiting');
        keyToItem.set(key, item);
    }

    const counts: Counts = { done: 0, skipped: 0, errors: 0, total: items.length };
    let prevLineCount = 0;
    let spinnerFrame = 0;

    const labelByKey = (key: string) => labelFn(keyToItem.get(key)!);

    function draw() {
        const lines = renderUI(states, keys, spinnerFrame, counts, labelByKey);
        if (prevLineCount > 0) {
            process.stderr.write(`\x1b[${prevLineCount}A\x1b[J`);
        }
        process.stderr.write(lines.join('\n') + '\n');
        prevLineCount = lines.length;
    }

    const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        draw();
    }, 80);

    draw();

    let i = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (i < items.length) {
            const item = items[i++];
            const key = keyFn(item);

            states.set(key, 'processing');
            draw();

            const result = await processItem(item);
            states.set(key, result.state);
            if (result.state === 'error') counts.errors++;
            else counts[result.state]++;
            draw();
        }
    });
    await Promise.all(workers);

    clearInterval(spinnerInterval);
    draw();
}
