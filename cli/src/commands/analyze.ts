import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_CONTENTS_PREFIX, DOCUMENT_CONTENTS_FIELD_COUNT, DOCUMENT_CONTENTS_CHUNK_SIZE } from '../template.js';

function toDropboxPath(localPath: string): string {
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

const PROMPT = `Analyze the file provided and return ONLY a JSON object (no markdown fences, no extra text) with these fields:
- "name": a short description (a handful of words) of what this file is. Don't state the obvious — for example, if it's an image, don't start with "image of...". If you can determine a meaningful date from the document content (e.g. signature date, invoice date, statement period, publication date — anything that accurately locates the document in time), prefix the name with that date followed by a space, dash and space. Use the format YYYY-MM-DD, or YYYY-MM if only month precision is available, or YYYY if only the year. If no reliable date can be extracted from the content, check the original filename for a date and use that instead. If no date can be determined at all, omit the prefix. Only use filesystem friendly characters, so avoid accents and puntuation.
- "description": ~100 words explaining what this file is and what's in it. Write it so it works well as input to an embedding model for vector search.
- "detail": optional. A markdown summary of the key details in the document, formatted for quick scanning. Omit this field if the file has no meaningful detail to extract (e.g. a simple image).

Prefer the Italian language when analyzing documents in Italian, and English for documents in English or other languages. Use the original language only for words that don't translate well, like product names, organization names, specific jargon, etc.

Return ONLY the JSON object.`;

function collectFiles(dir: string): string[] {
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

async function analyzeFile(localPath: string) {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);

    const basename = path.basename(absolute);
    const fullPrompt = `${PROMPT}\n\nThe file to analyze is at: ${absolute}\nThe original filename is: ${basename}`;
    const raw = await new Promise<string>((resolve, reject) => {
        const child = spawn('claude', ['-p', '--allowedTools', 'Read', '--output-format', 'json', fullPrompt], { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.on('close', (code) => {
            const output = Buffer.concat(chunks).toString('utf-8');
            if (code !== 0) reject(new Error(`claude exited with code ${code}: ${output}`));
            else resolve(output);
        });
        child.on('error', reject);
    });

    const response = JSON.parse(raw);
    const text: string = response.result;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`Could not extract JSON from Claude response:\n${text}`);
    }
    const analysis = JSON.parse(jsonMatch[0]);

    const dbx = getClient();
    const templateId = getTemplateId();

    const jsonStr = JSON.stringify(analysis);
    const maxSize = DOCUMENT_CONTENTS_FIELD_COUNT * DOCUMENT_CONTENTS_CHUNK_SIZE;
    if (Buffer.byteLength(jsonStr, 'utf-8') > maxSize) {
        throw new Error(`Analysis JSON exceeds ${maxSize} bytes, cannot store in Dropbox metadata.`);
    }

    const fields: Array<{ name: string; value: string }> = [];
    for (let i = 0; i < DOCUMENT_CONTENTS_FIELD_COUNT; i++) {
        const chunk = jsonStr.slice(i * DOCUMENT_CONTENTS_CHUNK_SIZE, (i + 1) * DOCUMENT_CONTENTS_CHUNK_SIZE);
        fields.push({
            name: `${FIELD_DOCUMENT_CONTENTS_PREFIX}${i + 1}`,
            value: chunk ?? '',
        });
    }

    const propertyGroup = { template_id: templateId, fields };

    try {
        await dbx.filePropertiesPropertiesAdd({
            path: dropboxPath,
            property_groups: [propertyGroup],
        });
    } catch (err: any) {
        const isAlreadyExists =
            err?.error?.error?.path?.['.tag'] === 'property_group_already_exists' || JSON.stringify(err?.error).includes('property_group_already_exists');

        if (isAlreadyExists) {
            await dbx.filePropertiesPropertiesUpdate({
                path: dropboxPath,
                update_property_groups: [{ template_id: templateId, add_or_update_fields: fields }],
            });
        } else {
            throw err;
        }
    }
}

// --- Progress UI ---

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const MAX_VISIBLE = 10;

type FileState = 'waiting' | 'processing' | 'done' | 'skipped' | 'error';

function shortName(filePath: string): string {
    try {
        return toDropboxPath(filePath);
    } catch {
        return path.basename(filePath);
    }
}

function renderUI(
    states: Map<string, FileState>,
    files: string[],
    spinnerFrame: number,
    counts: { done: number; skipped: number; errors: number; total: number },
) {
    const lines: string[] = [];
    const spin = SPINNER[spinnerFrame % SPINNER.length];

    const doneFiles = files.filter((f) => states.get(f) === 'done' || states.get(f) === 'skipped');
    const processingFiles = files.filter((f) => states.get(f) === 'processing');
    const errorFiles = files.filter((f) => states.get(f) === 'error');
    const waitingFiles = files.filter((f) => states.get(f) === 'waiting');

    const visibleDone = doneFiles.slice(-MAX_VISIBLE);
    if (doneFiles.length > MAX_VISIBLE) {
        lines.push(`${GRAY}  ... ${doneFiles.length - MAX_VISIBLE} more completed${RESET}`);
    }
    for (const f of visibleDone) {
        const label = states.get(f) === 'skipped' ? 'skipped' : 'done';
        lines.push(`${GREEN}  ✓ ${shortName(f)} ${GRAY}(${label})${RESET}`);
    }

    for (const f of errorFiles) {
        lines.push(`${RED}  ✗ ${shortName(f)}${RESET}`);
    }

    for (const f of processingFiles) {
        lines.push(`${YELLOW}  ${spin} ${shortName(f)}${RESET}`);
    }

    const visibleWaiting = waitingFiles.slice(0, MAX_VISIBLE);
    for (const f of visibleWaiting) {
        lines.push(`${GRAY}  · ${shortName(f)}${RESET}`);
    }
    if (waitingFiles.length > MAX_VISIBLE) {
        lines.push(`${GRAY}  ... ${waitingFiles.length - MAX_VISIBLE} more${RESET}`);
    }

    const completed = counts.done + counts.skipped + counts.errors;
    lines.push('');
    lines.push(`${BOLD}  ${completed}/${counts.total}${RESET}${GRAY} — ${counts.done} analyzed, ${counts.skipped} skipped, ${counts.errors} errors${RESET}`);

    return lines;
}

interface AnalyzeOptions {
    force: boolean;
    concurrency: number;
}

export async function analyze(localPath: string, options: AnalyzeOptions) {
    const absolute = path.resolve(localPath);
    const stat = fs.statSync(absolute);

    const files = stat.isDirectory() ? collectFiles(absolute) : [absolute];

    if (files.length === 0) {
        console.log('No files found.');
        return;
    }

    // Single file: simple output
    if (files.length === 1) {
        const dropboxPath = toDropboxPath(files[0]);
        if (!options.force) {
            const existing = await fetchFieldValue(dropboxPath, `${FIELD_DOCUMENT_CONTENTS_PREFIX}1`);
            if (existing) {
                console.log(`${GREEN}✓${RESET} Already analyzed: ${dropboxPath}`);
                return;
            }
        }
        await analyzeFile(files[0]);
        console.log(`${GREEN}✓${RESET} ${dropboxPath}`);
        return;
    }

    // Multi-file: progress UI
    const states = new Map<string, FileState>();
    for (const f of files) states.set(f, 'waiting');

    const counts = { done: 0, skipped: 0, errors: 0, total: files.length };
    let prevLineCount = 0;
    let spinnerFrame = 0;

    function draw() {
        const lines = renderUI(states, files, spinnerFrame, counts);
        // Move up and clear previous output
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

    async function processFile(file: string) {
        const dropboxPath = toDropboxPath(file);

        if (!options.force) {
            const existing = await fetchFieldValue(dropboxPath, `${FIELD_DOCUMENT_CONTENTS_PREFIX}1`);
            if (existing) {
                states.set(file, 'skipped');
                counts.skipped++;
                draw();
                return;
            }
        }

        states.set(file, 'processing');
        draw();

        try {
            await analyzeFile(file);
            states.set(file, 'done');
            counts.done++;
        } catch {
            states.set(file, 'error');
            counts.errors++;
        }
        draw();
    }

    let i = 0;
    const workers = Array.from({ length: Math.min(options.concurrency, files.length) }, async () => {
        while (i < files.length) {
            const file = files[i++];
            await processFile(file);
        }
    });
    await Promise.all(workers);

    clearInterval(spinnerInterval);
    draw();
}
