import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { reassembleDocumentContents, FIELD_EMBEDDING_HASH } from '../template.js';
import { generateEmbedding } from '../embeddings.js';
import { upsertVector, type VectorMetadata } from '../vector-store.js';
import { computeDateBounds } from '../dates.js';
import { runWithProgress, type ProcessResult } from '../progress.js';
import { toDropboxPath, collectFiles, shortName } from '../files.js';

const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

interface Analysis {
    name: string;
    description: string;
    detail: string;
    relevant_dates: string[];
}

function isAnalysisComplete(analysis: unknown): analysis is Analysis {
    if (!analysis || typeof analysis !== 'object') return false;
    const obj = analysis as Record<string, unknown>;
    return ['name', 'description', 'detail', 'relevant_dates'].every((f) => f in obj);
}

function hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

interface FetchResult {
    analysis: Analysis;
    fileId: string;
    existingHash: string | undefined;
}

async function fetchAnalysisAndId(dropboxPath: string): Promise<FetchResult | null> {
    const dbx = getClient();
    const templateId = getTemplateId();
    const response = await (dbx as any).filesGetMetadata({
        path: dropboxPath,
        include_property_groups: { '.tag': 'filter_some', filter_some: [templateId] },
    });
    const rawId: string = response.result.id;
    const fileId = rawId.startsWith('id:') ? rawId.slice(3) : rawId;
    const group = response.result.property_groups?.find((g: any) => g.template_id === templateId);
    if (!group) return null;

    const analysis = reassembleDocumentContents(group.fields);
    if (!isAnalysisComplete(analysis)) return null;

    const existingHash: string | undefined = group.fields.find((f: any) => f.name === FIELD_EMBEDDING_HASH)?.value || undefined;
    return { analysis, fileId, existingHash };
}

async function storeEmbeddingHash(dropboxPath: string, hash: string): Promise<void> {
    const dbx = getClient();
    const templateId = getTemplateId();
    await dbx.filePropertiesPropertiesUpdate({
        path: dropboxPath,
        update_property_groups: [{ template_id: templateId, add_or_update_fields: [{ name: FIELD_EMBEDDING_HASH, value: hash }] }],
    });
}

interface EmbedOptions {
    force: boolean;
    concurrency: number;
    limit?: number;
    dryRun: boolean;
}

export async function embed(localPath: string, options: EmbedOptions) {
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
        try {
            const result = await processFile(files[0], options);
            if (result === 'skipped') {
                console.log(`${GREEN}✓${RESET} Skipped: ${dropboxPath}`);
            } else {
                console.log(`${GREEN}✓${RESET} Embedded: ${dropboxPath}`);
            }
        } catch (err) {
            console.error(err);
            process.exit(1);
        }
        return;
    }

    await runWithProgress({
        items: files,
        keyFn: (f) => f,
        labelFn: shortName,
        concurrency: options.concurrency,
        async processItem(file, setStatus): Promise<ProcessResult> {
            try {
                const state = await processFile(file, options, setStatus);
                return { state };
            } catch (err: any) {
                return { state: 'error', error: err?.message ?? String(err) };
            }
        },
    });
}

export async function embedDropboxFile(
    dropboxPath: string,
    force: boolean,
    setStatus?: (s: string) => void,
): Promise<'done' | 'skipped'> {
    setStatus?.('fetching analysis');
    const data = await fetchAnalysisAndId(dropboxPath);
    if (!data) {
        setStatus?.('no analysis');
        return 'skipped';
    }

    const { analysis, fileId, existingHash } = data;
    const embeddingText = `${analysis.name}\n\n${analysis.description}\n\n${analysis.detail}`;
    const newHash = hashText(embeddingText);

    if (!force && existingHash === newHash) {
        return 'skipped';
    }

    setStatus?.('generating embedding');
    const values = await generateEmbedding(embeddingText);

    const dateBounds = computeDateBounds(analysis.relevant_dates);
    const metadata: VectorMetadata = {
        dropbox_path: dropboxPath,
        name: analysis.name,
        description: analysis.description,
        ...(dateBounds && {
            min_date: dateBounds.min_date,
            max_date: dateBounds.max_date,
            all_dates: dateBounds.all_dates,
        }),
    };

    setStatus?.('upserting vector');
    await upsertVector(fileId, values, metadata);

    try {
        setStatus?.('saving hash');
        await storeEmbeddingHash(dropboxPath, newHash);
    } catch {
        // Non-fatal: the vector was upserted, but the hash couldn't be saved
        // The file will simply be re-embedded on the next run.
    }

    return 'done';
}

async function processFile(
    localPath: string,
    options: EmbedOptions,
    setStatus?: (s: string) => void,
): Promise<'done' | 'skipped'> {
    const dropboxPath = toDropboxPath(path.resolve(localPath));

    if (options.dryRun) {
        setStatus?.('fetching analysis');
        const data = await fetchAnalysisAndId(dropboxPath);
        if (!data) return 'skipped';
        setStatus?.('dry run');
        return 'done';
    }

    return embedDropboxFile(dropboxPath, options.force, setStatus);
}
