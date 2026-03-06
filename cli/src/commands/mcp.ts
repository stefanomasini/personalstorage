import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { listFolderData, type ListResult } from './list.js';
import { getCached, setCached } from '../cache.js';

export async function startMcpServer(): Promise<void> {
    const server = new McpServer(
        { name: 'personalstorage', version: '0.1.0' },
        {
            instructions:
                'Manage custom metadata on Dropbox folders. Use "list" to browse folder contents and their storage usage annotations.',
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
                const cached = getCached<ListResult>(path);
                const result = cached ?? await listFolderData(path);
                if (!cached) setCached(path, result);
                return {
                    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
                };
            } catch (err: any) {
                const message = err?.error?.error_summary ?? err?.message ?? String(err);
                return {
                    isError: true,
                    content: [{ type: 'text' as const, text: `Error: ${message}` }],
                };
            }
        },
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
