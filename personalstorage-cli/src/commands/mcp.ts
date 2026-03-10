import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { listFolderData } from './list.js';
import { generateEmbedding } from '../embeddings.js';
import { queryVectors } from '../vector-store.js';
import { parseDateToEpoch } from '../dates.js';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import {
    FIELD_DOCUMENT_CONTENTS_PREFIX,
    FIELD_STORAGE_TEMPLATES,
    reassembleDocumentContents,
} from '../template.js';

const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm',
    '.js', '.ts', '.py', '.rb', '.sh', '.yaml', '.yml', '.toml',
    '.css', '.svg', '.log', '.ini', '.cfg', '.conf',
]);

function mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xml': 'application/xml',
    };
    return map[ext] ?? 'application/octet-stream';
}

function errorResult(err: any) {
    const message = err?.error?.error_summary ?? err?.message ?? String(err);
    return {
        isError: true as const,
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
    };
}

export async function startMcpServer(): Promise<void> {
    const server = new McpServer(
        { name: 'personalstorage', version: '0.1.0' },
        {
            instructions:
                'Manage custom metadata on Dropbox folders. Tools: "list" to browse folders, "search" for semantic file search, "get-file-details" for full metadata, "download-file" for raw content.',
        },
    );

    server.registerTool(
        'list',
        {
            description: 'List child folders of a Dropbox path with their storage usage metadata',
            inputSchema: z.object({
                path: z.string().describe('Dropbox folder path (e.g. "" for root, "/Photos")'),
            }),
        },
        async ({ path }) => {
            try {
                const result = await listFolderData(path);
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
                };
            } catch (err: any) {
                return errorResult(err);
            }
        },
    );

    server.registerTool(
        'search',
        {
            description:
                'Semantic search over indexed files. Returns a ranked list of matches with IDs, paths, names, descriptions, and similarity scores.',
            inputSchema: z.object({
                query: z.string().describe('Free-text search query'),
                from: z.string().optional().describe('Start of date range filter (YYYY, YYYY-MM, YYYY-MM-DD, YYYY-Q1, etc.)'),
                to: z.string().optional().describe('End of date range filter (same formats as "from")'),
                limit: z.number().optional().default(10).describe('Max results to return (default 10)'),
            }),
        },
        async ({ query, from, to, limit }) => {
            try {
                const values = await generateEmbedding(query);

                const filter: Record<string, any> = {};
                if (from) {
                    const start = parseDateToEpoch(from, 'min');
                    if (isNaN(start)) return errorResult(new Error(`Invalid "from" date: ${from}`));
                    filter.max_date = { $gte: start };
                }
                if (to) {
                    const end = parseDateToEpoch(to, 'max');
                    if (isNaN(end)) return errorResult(new Error(`Invalid "to" date: ${to}`));
                    filter.min_date = { $lte: end };
                }

                const results = await queryVectors(
                    values,
                    limit,
                    Object.keys(filter).length > 0 ? filter : undefined,
                );

                const items = results.map((r) => ({
                    id: r.id,
                    score: r.score,
                    dropbox_path: r.metadata.dropbox_path,
                    name: r.metadata.name,
                    description: r.metadata.description,
                }));

                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }],
                };
            } catch (err: any) {
                return errorResult(err);
            }
        },
    );

    server.registerTool(
        'get-file-details',
        {
            description:
                'Get full metadata for a Dropbox file, including AI-generated analysis (name, description, detail, relevant dates) and storage annotations.',
            inputSchema: z.object({
                path: z.string().describe('Dropbox file path (e.g. "/Documents/tax-2023.pdf")'),
            }),
        },
        async ({ path: filePath }) => {
            try {
                const dbx = getClient();
                const templateId = getTemplateId();

                const response = await (dbx as any).filesGetMetadata({
                    path: filePath,
                    include_property_groups: {
                        '.tag': 'filter_some',
                        filter_some: [templateId],
                    },
                });

                const propertyGroups = response.result.property_groups;
                const group = propertyGroups?.find((g: any) => g.template_id === templateId);

                if (!group) {
                    return {
                        content: [{ type: 'text' as const, text: JSON.stringify({ path: filePath, metadata: null }) }],
                    };
                }

                const result: Record<string, unknown> = { path: filePath };
                for (const field of group.fields) {
                    if (field.name.startsWith(FIELD_DOCUMENT_CONTENTS_PREFIX)) continue;
                    if (!field.value) continue;
                    if (field.name === FIELD_STORAGE_TEMPLATES) {
                        try {
                            result[field.name] = JSON.parse(field.value);
                        } catch {
                            result[field.name] = field.value;
                        }
                    } else {
                        result[field.name] = field.value;
                    }
                }

                const docContents = reassembleDocumentContents(group.fields);
                if (docContents) {
                    result.document_contents = docContents;
                }

                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
                };
            } catch (err: any) {
                return errorResult(err);
            }
        },
    );

    server.registerTool(
        'download-file',
        {
            description:
                'Download raw file content from Dropbox. Text files are returned as text; binary files (images, PDFs) as base64.',
            inputSchema: z.object({
                path: z.string().describe('Dropbox file path (e.g. "/Documents/tax-2023.pdf")'),
            }),
        },
        async ({ path: filePath }) => {
            try {
                const dbx = getClient();
                const response = await (dbx as any).filesDownload({ path: filePath });
                const buffer: Buffer = response.result.fileBinary;
                const ext = path.extname(filePath).toLowerCase();

                if (TEXT_EXTENSIONS.has(ext)) {
                    return {
                        content: [{ type: 'text' as const, text: buffer.toString('utf-8') }],
                    };
                }

                return {
                    content: [{
                        type: 'resource' as const,
                        resource: {
                            uri: `dropbox://${filePath}`,
                            mimeType: mimeFromExt(ext),
                            blob: buffer.toString('base64'),
                        },
                    }],
                };
            } catch (err: any) {
                return errorResult(err);
            }
        },
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
