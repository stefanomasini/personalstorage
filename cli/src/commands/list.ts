import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF } from "../template.js";

interface ListOptions {
  markdown?: boolean;
}

export async function listMetadata(folderPath: string, options: ListOptions = {}) {
  const dbx = getClient();
  const templateId = getTemplateId();

  let entries: any[] = [];
  let response = await (dbx as any).filesListFolder({
    path: folderPath,
    include_property_groups: {
      ".tag": "filter_some",
      filter_some: [templateId],
    },
  });
  entries.push(...response.result.entries);

  while (response.result.has_more) {
    response = await (dbx as any).filesListFolderContinue({
      cursor: response.result.cursor,
    });
    entries.push(...response.result.entries);
  }

  const folders = entries
    .filter((e: any) => e[".tag"] === "folder")
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  for (const folder of folders) {
    const group = folder.property_groups?.find(
      (g: any) => g.template_id === templateId
    );

    const fields = group?.fields ?? [];
    const ignore = fields.find((f: any) => f.name === FIELD_STORAGE_IGNORE)?.value;
    if (ignore === "true") continue;

    const usage = fields.find((f: any) => f.name === FIELD_STORAGE_USAGE)?.value;
    const leaf = fields.find((f: any) => f.name === FIELD_STORAGE_LEAF)?.value;
    const isLeaf = leaf === "true";
    const description = usage || "(no usage set)";
    const useMarkdown = options.markdown || !process.stdout.isTTY;

    if (useMarkdown) {
      const leafTag = isLeaf ? " [leaf]" : " [subfolders]";
      lines.push(`- **${folder.name}**${leafTag} — ${description}`);
    } else {
      const name = `\x1b[1;36m${folder.name}\x1b[0m`;
      const leafTag = isLeaf
        ? ` \x1b[33m[leaf]\x1b[0m`
        : ` \x1b[90m[subfolders]\x1b[0m`;
      const desc = usage
        ? `\x1b[0m${usage}\x1b[0m`
        : `\x1b[90m(no usage set)\x1b[0m`;
      lines.push(`  ${name}${leafTag} — ${desc}`);
    }
  }

  if (lines.length === 0) {
    console.log("No non-ignored folders found.");
    return;
  }

  console.log(lines.join("\n"));
}
