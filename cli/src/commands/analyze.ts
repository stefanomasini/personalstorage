import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_CONTENTS_PREFIX, FIELD_DOCUMENT_LOCATION, DOCUMENT_CONTENTS_FIELD_COUNT, DOCUMENT_CONTENTS_CHUNK_SIZE, reassembleDocumentContents } from '../template.js';
import { getAdapter, addUsage, formatUsage, type UsageStats } from '../ai-adapter.js';

import { runWithProgress, type ProcessResult } from '../progress.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';
import { decideLocationForDropboxPath, storeLocationMetadata } from './decide-location.js';

const PROMPT = `Analyze the file provided and return ONLY a JSON object (no markdown fences, no extra text) with these fields:
- "name": a short description (a handful of words) of what this file is. Don't state the obvious — for example, if it's an image, don't start with "image of...". If you can determine a meaningful date from the document content (e.g. signature date, invoice date, statement period, publication date — anything that accurately locates the document in time), prefix the name with that date followed by a space, dash and space. Use the format YYYY-MM-DD, or YYYY-MM if only month precision is available, or YYYY if only the year. If no reliable date can be extracted from the content, check the original filename for a date and use that instead. If no date can be determined at all, omit the prefix. Only use filesystem friendly characters, so avoid accents and puntuation.
- "description": ~100 words explaining what this file is and what's in it. Write it so it works well as input to an embedding model for vector search. Do not reference the file's location or path in the description — the file may be relocated, so the description should only describe the content itself. However, if the folder structure reveals useful context about the file (e.g. the name of an event, a category, or a circumstance), you may incorporate that knowledge into the description without mentioning the path.
- "detail": a markdown summary that captures the important information from the document — enough that someone rarely needs to open the original file. Include key facts like names, amounts, dates, parties involved, and notable terms or conditions. Use headings and bullet points for quick scanning. Don't reproduce the entire document, but don't leave out information that might be needed later. For simple files with no meaningful detail (e.g. a photo), use a brief note like "No meaningful detail to extract".
- "relevant_dates": a list of all important dates found in the document (e.g. signature dates, due dates, invoice dates, period start/end, event dates, expiration dates). Each entry should use the format YYYY-MM-DD HH:MM:SS, or a partial subformat depending on the available precision: YYYY-MM-DD if no time is available, YYYY-MM if only month precision, YYYY if only the year. Use an empty array [] if no meaningful dates can be extracted.

Also consider the full path of the file. Sometimes the names of the containing folders carry meaningful context depending on how the file was organized.

Prefer the Italian language when analyzing documents in Italian, and English for documents in English or other languages. Use the original language only for words that don't translate well, like product names, organization names, specific jargon, etc.

Return ONLY the JSON object.`;

async function analyzeFile(localPath: string, onStatus?: (s: string) => void): Promise<UsageStats> {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);

    const basename = path.basename(absolute);
    const fullPrompt = `${PROMPT}\n\nThe original filename is: ${basename}\nThe full Dropbox path is: ${dropboxPath}`;
    const adapter = await getAdapter();
    const { text, usage } = await adapter.analyzeDocument(absolute, fullPrompt, onStatus);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`Could not extract JSON from response:\n${text}`);
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

    return usage;
}

const REQUIRED_FIELDS = ['name', 'description', 'detail', 'relevant_dates'];

export function isAnalysisComplete(analysis: unknown): boolean {
    if (!analysis || typeof analysis !== 'object') return false;
    const obj = analysis as Record<string, unknown>;
    return REQUIRED_FIELDS.every((f) => f in obj);
}

export async function fetchExistingAnalysis(dropboxPath: string): Promise<unknown | undefined> {
    const dbx = getClient();
    const templateId = getTemplateId();
    const response = await (dbx as any).filesGetMetadata({
        path: dropboxPath,
        include_property_groups: { '.tag': 'filter_some', filter_some: [templateId] },
    });
    const group = response.result.property_groups?.find((g: any) => g.template_id === templateId);
    if (!group) return undefined;
    return reassembleDocumentContents(group.fields);
}

const GREEN = '\x1b[32m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

interface AnalyzeOptions {
    force: boolean;
    concurrency: number;
    decideLocation: boolean;
    limit?: number;
}

export async function analyze(localPath: string, options: AnalyzeOptions) {
    const absolute = path.resolve(localPath);
    const stat = fs.statSync(absolute);

    let files = stat.isDirectory() ? collectFiles(absolute) : [absolute];
    if (options.limit && files.length > options.limit) {
        files = files.slice(0, options.limit);
    }

    if (files.length === 0) {
        console.log('No files found.');
        return;
    }

    // Single file: simple output
    if (files.length === 1) {
        const dropboxPath = toDropboxPath(files[0]);
        try {
            const result = await processFile(files[0], options);
            if (result.state === 'skipped') {
                console.log(`${GREEN}✓${RESET} Up to date: ${dropboxPath}`);
            } else {
                console.log(`${GREEN}✓${RESET} ${dropboxPath}`);
                if (result.usage) console.log(`  ${GRAY}${formatUsage(result.usage)}${RESET}`);
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
        async processItem(file, setStatus): Promise<ProcessResult> {
            try {
                const result = await processFile(file, options, setStatus);
                return { state: result.state === 'skipped' ? 'skipped' : 'done', usage: result.usage };
            } catch (err: any) {
                return { state: 'error', error: err?.message ?? String(err) };
            }
        },
    });
}

interface FileResult {
    state: 'done' | 'skipped';
    usage?: UsageStats;
}

async function processFile(localPath: string, options: AnalyzeOptions, setStatus?: (s: string) => void): Promise<FileResult> {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);

    let analyzeUsage: UsageStats | undefined;
    setStatus?.('checking');
    const existing = await fetchExistingAnalysis(dropboxPath);
    const needsAnalysis = options.force || !isAnalysisComplete(existing);

    if (needsAnalysis) {
        setStatus?.('analyzing');
        analyzeUsage = await analyzeFile(localPath, setStatus);
    }

    if (!options.decideLocation) {
        return { state: analyzeUsage ? 'done' : 'skipped', usage: analyzeUsage };
    }

    let locationUsage: UsageStats | undefined;
    if (analyzeUsage) {
        setStatus?.('deciding location');
        const result = await decideLocationForDropboxPath(dropboxPath, setStatus);
        locationUsage = result.usage;
        setStatus?.('saving location');
        await storeLocationMetadata(dropboxPath, result.location);
    } else {
        setStatus?.('checking location');
        const hasLocation = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
        if (!hasLocation || options.force) {
            setStatus?.('deciding location');
            const result = await decideLocationForDropboxPath(dropboxPath, setStatus);
            locationUsage = result.usage;
            setStatus?.('saving location');
            await storeLocationMetadata(dropboxPath, result.location);
        } else {
            return { state: 'skipped' };
        }
    }

    const totalUsage = analyzeUsage && locationUsage
        ? addUsage(analyzeUsage, locationUsage)
        : analyzeUsage ?? locationUsage;

    return { state: 'done', usage: totalUsage };
}
