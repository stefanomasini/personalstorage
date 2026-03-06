import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_CONTENTS_PREFIX, FIELD_DOCUMENT_LOCATION, DOCUMENT_CONTENTS_FIELD_COUNT, DOCUMENT_CONTENTS_CHUNK_SIZE } from '../template.js';
import { askClaude } from '../claude-adapter.js';
import { runWithProgress, type ProcessResult } from '../progress.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';
import { decideLocationForDropboxPath, storeLocationMetadata } from './decide-location.js';

const PROMPT = `Analyze the file provided and return ONLY a JSON object (no markdown fences, no extra text) with these fields:
- "name": a short description (a handful of words) of what this file is. Don't state the obvious — for example, if it's an image, don't start with "image of...". If you can determine a meaningful date from the document content (e.g. signature date, invoice date, statement period, publication date — anything that accurately locates the document in time), prefix the name with that date followed by a space, dash and space. Use the format YYYY-MM-DD, or YYYY-MM if only month precision is available, or YYYY if only the year. If no reliable date can be extracted from the content, check the original filename for a date and use that instead. If no date can be determined at all, omit the prefix. Only use filesystem friendly characters, so avoid accents and puntuation.
- "description": ~100 words explaining what this file is and what's in it. Write it so it works well as input to an embedding model for vector search. Do not reference the file's location or path in the description — the file may be relocated, so the description should only describe the content itself. However, if the folder structure reveals useful context about the file (e.g. the name of an event, a category, or a circumstance), you may incorporate that knowledge into the description without mentioning the path.
- "detail": optional. A markdown summary of the key details in the document, formatted for quick scanning. Omit this field if the file has no meaningful detail to extract (e.g. a simple image).

Also consider the full path of the file. Sometimes the names of the containing folders carry meaningful context depending on how the file was organized.

Prefer the Italian language when analyzing documents in Italian, and English for documents in English or other languages. Use the original language only for words that don't translate well, like product names, organization names, specific jargon, etc.

Return ONLY the JSON object.`;

async function analyzeFile(localPath: string) {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);

    const basename = path.basename(absolute);
    const fullPrompt = `${PROMPT}\n\nThe file to analyze is at: ${absolute}\nThe original filename is: ${basename}\nThe full Dropbox path is: ${dropboxPath}`;
    const text = await askClaude(fullPrompt, { allowedTools: ['Read'] });

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

const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

interface AnalyzeOptions {
    force: boolean;
    concurrency: number;
    decideLocation: boolean;
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
        try {
            const result = await processFile(files[0], options);
            if (result === 'skipped') {
                console.log(`${GREEN}✓${RESET} Already processed: ${dropboxPath}`);
            } else {
                console.log(`${GREEN}✓${RESET} ${dropboxPath}`);
            }
        } catch (err) {
            console.error(err);
            process.exit(1);
        }
        return;
    }

    // Multi-file: progress UI
    await runWithProgress({
        items: files,
        keyFn: (f) => f,
        labelFn: shortName,
        concurrency: options.concurrency,
        async processItem(file): Promise<ProcessResult> {
            try {
                const result = await processFile(file, options);
                return { state: result === 'skipped' ? 'skipped' : 'done' };
            } catch {
                return { state: 'error' };
            }
        },
    });
}

async function processFile(localPath: string, options: AnalyzeOptions): Promise<'done' | 'skipped'> {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);

    let didAnalyze = false;
    const hasAnalysis = await fetchFieldValue(dropboxPath, `${FIELD_DOCUMENT_CONTENTS_PREFIX}1`);

    if (!hasAnalysis || options.force) {
        await analyzeFile(localPath);
        didAnalyze = true;
    }

    if (!options.decideLocation) {
        return didAnalyze ? 'done' : 'skipped';
    }

    if (didAnalyze) {
        const location = await decideLocationForDropboxPath(dropboxPath);
        await storeLocationMetadata(dropboxPath, location);
    } else {
        const hasLocation = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
        if (!hasLocation || options.force) {
            const location = await decideLocationForDropboxPath(dropboxPath);
            await storeLocationMetadata(dropboxPath, location);
        } else {
            return 'skipped';
        }
    }

    return 'done';
}
