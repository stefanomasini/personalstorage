import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { listFolderData } from './list.js';
import { applyMetadata } from './set.js';
import { fetchExistingTemplates } from '../metadata.js';
import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { FIELD_DOCUMENT_CONTENTS_PREFIX, reassembleDocumentContents } from '../template.js';

const UI_DIST = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../ui/dist');
const ENTRY_HTML = 'live.html';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
};

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function parseQuery(url: string): URLSearchParams {
    const idx = url.indexOf('?');
    return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

function normalizePath(p: string): string {
    return !p || p === '/' ? '' : p;
}

async function getRawMetadata(filePath: string) {
    const dbx = getClient();
    const templateId = getTemplateId();
    const response = await (dbx as any).filesGetMetadata({
        path: filePath,
        include_property_groups: {
            '.tag': 'filter_some',
            filter_some: [templateId],
        },
    });
    const group = response.result.property_groups?.find((g: any) => g.template_id === templateId);
    if (!group) return {};
    const result: Record<string, string> = {};
    for (const field of group.fields) {
        if (field.name.startsWith(FIELD_DOCUMENT_CONTENTS_PREFIX)) continue;
        result[field.name] = field.value;
    }
    const docContents = reassembleDocumentContents(group.fields);
    if (docContents) {
        result['document_contents'] = JSON.stringify(docContents);
    }
    return result;
}

export async function startLiveServer(port: number) {
    const server = http.createServer(async (req, res) => {
        const url = req.url ?? '/';
        const method = req.method ?? 'GET';

        try {
            if (method === 'GET' && url.startsWith('/api/list')) {
                const params = parseQuery(url);
                const folderPath = normalizePath(params.get('path') ?? '');
                const data = await listFolderData(folderPath);
                jsonResponse(res, 200, data);
                return;
            }

            if (method === 'GET' && url.startsWith('/api/get')) {
                const params = parseQuery(url);
                const filePath = normalizePath(params.get('path') ?? '');
                const data = await getRawMetadata(filePath);
                jsonResponse(res, 200, data);
                return;
            }

            if (method === 'GET' && url.startsWith('/api/templates')) {
                const params = parseQuery(url);
                const filePath = normalizePath(params.get('path') ?? '');
                const data = await fetchExistingTemplates(filePath);
                jsonResponse(res, 200, data);
                return;
            }

            if (method === 'POST' && url === '/api/set') {
                const body = await readBody(req);
                const payload = JSON.parse(body);
                const filePath = normalizePath(payload.path);
                const options: any = {};
                if (payload.usage !== undefined) options.usage = payload.usage;
                if (payload.ignore !== undefined) options.ignore = payload.ignore;
                if (payload.leaf !== undefined) options.leaf = payload.leaf;
                if (payload.applyTemplate !== undefined) options.applyTemplate = payload.applyTemplate;
                if (payload.template) options.template = payload.template;
                if (payload.removeTemplate) options.removeTemplate = payload.removeTemplate;
                if (payload.removeTemplateEntry) options.removeTemplateEntry = payload.removeTemplateEntry;

                const fields = await applyMetadata(filePath, options);
                jsonResponse(res, 200, { ok: true, fields });
                return;
            }

            // Serve static files from UI dist
            if (method === 'GET') {
                const urlPath = url.split('?')[0];
                const filePath = urlPath === '/' || urlPath === '/index.html'
                    ? path.join(UI_DIST, ENTRY_HTML)
                    : path.join(UI_DIST, urlPath);

                const resolved = path.resolve(filePath);
                if (!resolved.startsWith(UI_DIST)) {
                    jsonResponse(res, 403, { error: 'Forbidden' });
                    return;
                }

                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
                    const ext = path.extname(resolved);
                    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
                    res.writeHead(200, { 'Content-Type': contentType });
                    fs.createReadStream(resolved).pipe(res);
                    return;
                }
            }

            jsonResponse(res, 404, { error: 'Not found' });
        } catch (err: any) {
            const message = err?.message ?? String(err);
            jsonResponse(res, 400, { error: message });
        }
    });

    server.listen(port, () => {
        const url = `http://localhost:${port}`;
        console.log(`Live server running at ${url}`);
        exec(`open ${url}`);
    });
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
