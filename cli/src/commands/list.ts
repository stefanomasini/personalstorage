import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE } from "../template.js";

export async function listMetadata(folderPath: string) {
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
    const description = usage || "(no usage set)";
    lines.push(`- **${folder.name}** — ${description}`);
  }

  if (lines.length === 0) {
    console.log("No non-ignored folders found.");
    return;
  }

  console.log(lines.join("\n"));
}
