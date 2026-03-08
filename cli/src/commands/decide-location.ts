import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { fetchFieldValue } from '../metadata.js';
import { FIELD_DOCUMENT_LOCATION, reassembleDocumentContents } from '../template.js';
import { chatWithTools, addUsage, formatUsage, type UsageStats } from '../gemini-adapter.js';
import { runWithProgress, type ProcessResult } from '../progress.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';
import { listFolderData } from './list.js';

const PROMPT = `You are a file organization assistant. You will receive a JSON document analysis describing a file's contents and the file's current Dropbox path.

Your task: decide the best destination folder and filename for this file within the Dropbox hierarchy.

PROCESS:
- The root folder listing is already provided below. Use the list_folder tool to drill deeper into subfolders.
- Each folder has a "usage" annotation explaining what it stores. Use these to navigate toward the right location.
- Drill down into promising folders until you find the most specific appropriate location (ideally a leaf folder).
- Consider the document's content, language, date, and type when choosing.
- If no folder clearly fits the document, do NOT force a choice.

RESPONSE FORMAT:
Return ONLY a JSON object (no markdown fences, no extra text) with one field:
- "location": the full destination path including filename (e.g. "/Documents/Tax/2024 Tax Return.pdf"), or "<UNSURE>" if no folder clearly fits.

When deciding on the filename, prefer the "name" field from the document analysis if available, combined with the original file extension. Use filesystem-safe characters only.`;

export async function decideLocationForDropboxPath(dropboxPath: string, onStatus?: (s: string) => void): Promise<{ location: string; usage: UsageStats }> {
    const ext = path.extname(dropboxPath);

    const dbx = getClient();
    const templateId = getTemplateId();
    const response = await (dbx as any).filesGetMetadata({
        path: dropboxPath,
        include_property_groups: { '.tag': 'filter_some', filter_some: [templateId] },
    });
    const group = response.result.property_groups?.find((g: any) => g.template_id === templateId);
    if (!group) throw new Error('No metadata found');

    const docContents = reassembleDocumentContents(group.fields);
    if (!docContents) throw new Error('No document analysis found');

    const rootListing = await listFolderData('');

    const fullPrompt = `${PROMPT}

Root folder listing (path ""):
${JSON.stringify(rootListing, null, 2)}

Do NOT call list_folder with path "" — it is already provided above. Start exploring from subfolders.

Document analysis:
${JSON.stringify(docContents, null, 2)}

Current Dropbox path: ${dropboxPath}
File extension: ${ext}`;

    const tools = [
        {
            name: 'list_folder',
            description: 'List contents of a Dropbox folder with storage usage annotations',
            parameters: {
                type: 'object' as const,
                properties: { path: { type: 'string' as const, description: 'The Dropbox folder path to list' } },
                required: ['path'],
            },
        },
    ];

    const { text, usage } = await chatWithTools(fullPrompt, tools, async (name, args) => {
        return await listFolderData((args.path as string) ?? '');
    }, onStatus);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Could not extract JSON from response:\n${text}`);

    const result = JSON.parse(jsonMatch[0]);
    return { location: result.location, usage };
}

async function decideLocationForFile(localPath: string, onStatus?: (s: string) => void): Promise<{ location: string; usage: UsageStats }> {
    const absolute = path.resolve(localPath);
    const dropboxPath = toDropboxPath(absolute);
    return decideLocationForDropboxPath(dropboxPath, onStatus);
}

export async function storeLocationMetadata(dropboxPath: string, location: string): Promise<void> {
    const dbx = getClient();
    const templateId = getTemplateId();
    const fields = [{ name: FIELD_DOCUMENT_LOCATION, value: location }];
    const propertyGroup = { template_id: templateId, fields };

    try {
        await dbx.filePropertiesPropertiesAdd({
            path: dropboxPath,
            property_groups: [propertyGroup],
        });
    } catch (err: any) {
        const isAlreadyExists =
            err?.error?.error?.path?.['.tag'] === 'property_group_already_exists' ||
            JSON.stringify(err?.error).includes('property_group_already_exists');

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
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

interface DecideLocationOptions {
    force: boolean;
    concurrency: number;
    limit?: number;
}

export async function decideLocation(localPath: string, options: DecideLocationOptions) {
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

    if (files.length === 1) {
        const dropboxPath = toDropboxPath(files[0]);
        if (!options.force) {
            const existing = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
            if (existing) {
                console.log(`${GREEN}✓${RESET} Already decided: ${dropboxPath} → ${existing}`);
                return;
            }
        }
        const hasAnalysis = await fetchFieldValue(dropboxPath, 'document_contents_1');
        if (!hasAnalysis) {
            console.log(`Skipped (no analysis): ${dropboxPath}`);
            return;
        }
        const { location, usage } = await decideLocationForFile(files[0]);
        await storeLocationMetadata(dropboxPath, location);
        console.log(`${GREEN}✓${RESET} ${dropboxPath} → ${location}`);
        console.log(`  ${GRAY}${formatUsage(usage)}${RESET}`);
        return;
    }

    await runWithProgress({
        items: files,
        keyFn: (f) => f,
        labelFn: shortName,
        concurrency: options.concurrency,
        async processItem(file, setStatus): Promise<ProcessResult> {
            const dropboxPath = toDropboxPath(file);

            setStatus('checking');
            if (!options.force) {
                const existing = await fetchFieldValue(dropboxPath, FIELD_DOCUMENT_LOCATION);
                if (existing) return { state: 'skipped' };
            }

            const hasAnalysis = await fetchFieldValue(dropboxPath, 'document_contents_1');
            if (!hasAnalysis) return { state: 'skipped' };

            try {
                setStatus('deciding');
                const { location, usage } = await decideLocationForFile(file, setStatus);
                setStatus('saving');
                await storeLocationMetadata(dropboxPath, location);
                return { state: 'done', usage };
            } catch (err: any) {
                return { state: 'error', error: err?.message ?? String(err) };
            }
        },
    });
}
