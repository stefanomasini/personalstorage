import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { listFolderData } from "./list.js";
import { applyMetadata } from "./set.js";
import { fetchExistingTemplates } from "../metadata.js";
import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_TEMPLATES, FIELD_DOCUMENT_CONTENTS_PREFIX, reassembleDocumentContents } from "../template.js";

const HTML_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "live-ui.html",
);

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

function normalizePath(p: string): string {
  return (!p || p === "/") ? "" : p;
}

async function getRawMetadata(filePath: string) {
  const dbx = getClient();
  const templateId = getTemplateId();
  const response = await (dbx as any).filesGetMetadata({
    path: filePath,
    include_property_groups: {
      ".tag": "filter_some",
      filter_some: [templateId],
    },
  });
  const group = response.result.property_groups?.find(
    (g: any) => g.template_id === templateId,
  );
  if (!group) return {};
  const result: Record<string, string> = {};
  for (const field of group.fields) {
    if (field.name.startsWith(FIELD_DOCUMENT_CONTENTS_PREFIX)) continue;
    result[field.name] = field.value;
  }
  const docContents = reassembleDocumentContents(group.fields);
  if (docContents) {
    result["document_contents"] = JSON.stringify(docContents);
  }
  return result;
}

export async function startLiveServer(port: number) {
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    try {
      if (method === "GET" && (url === "/" || url === "/index.html")) {
        const html = fs.readFileSync(HTML_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }

      if (method === "GET" && url.startsWith("/api/list")) {
        const params = parseQuery(url);
        const folderPath = normalizePath(params.get("path") ?? "");
        const data = await listFolderData(folderPath);
        jsonResponse(res, 200, data);
        return;
      }

      if (method === "GET" && url.startsWith("/api/get")) {
        const params = parseQuery(url);
        const filePath = normalizePath(params.get("path") ?? "");
        const data = await getRawMetadata(filePath);
        jsonResponse(res, 200, data);
        return;
      }

      if (method === "GET" && url.startsWith("/api/templates")) {
        const params = parseQuery(url);
        const filePath = normalizePath(params.get("path") ?? "");
        const data = await fetchExistingTemplates(filePath);
        jsonResponse(res, 200, data);
        return;
      }

      if (method === "POST" && url === "/api/set") {
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

      jsonResponse(res, 404, { error: "Not found" });
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
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
