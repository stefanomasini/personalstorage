import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import {
  FIELD_STORAGE_USAGE,
  FIELD_STORAGE_IGNORE,
  FIELD_STORAGE_LEAF,
  FIELD_STORAGE_APPLIED_TEMPLATE,
} from "../template.js";
import { fetchExistingTemplates, fetchFieldValue, getParentPath } from "../metadata.js";

interface ListOptions {
  markdown?: boolean;
}

export async function listMetadata(
  folderPath: string,
  options: ListOptions = {},
) {
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

  // Resolve applied template if present
  const appliedTemplateName = await fetchFieldValue(folderPath, FIELD_STORAGE_APPLIED_TEMPLATE);
  let templateEntries: Record<string, string> = {};
  if (appliedTemplateName && appliedTemplateName !== "") {
    const parentPath = getParentPath(folderPath);
    const parentTemplates = await fetchExistingTemplates(parentPath);
    templateEntries = parentTemplates[appliedTemplateName] ?? {};
  }

  const lines: string[] = [];
  for (const folder of folders) {
    const group = folder.property_groups?.find(
      (g: any) => g.template_id === templateId,
    );

    const fields = group?.fields ?? [];
    const ignore = fields.find(
      (f: any) => f.name === FIELD_STORAGE_IGNORE,
    )?.value;
    if (ignore === "true") continue;

    const useMarkdown = options.markdown || !process.stdout.isTTY;

    if (!group) {
      const tplUsage = templateEntries[folder.name];
      if (useMarkdown) {
        lines.push(tplUsage ? `- **${folder.name}** — ${tplUsage}` : `- **${folder.name}**`);
      } else {
        const name = `\x1b[1;36m${folder.name}\x1b[0m`;
        lines.push(tplUsage ? `${name} — ${tplUsage}` : name);
      }
      continue;
    }

    const ownUsage = fields.find(
      (f: any) => f.name === FIELD_STORAGE_USAGE,
    )?.value;
    const usage = ownUsage || templateEntries[folder.name];
    const leaf = fields.find((f: any) => f.name === FIELD_STORAGE_LEAF)?.value;
    const isLeaf = leaf === "true";
    if (useMarkdown) {
      if (usage) {
        lines.push(`- **${folder.name}** — ${usage}`);
      } else {
        lines.push(`- **${folder.name}**`);
      }
    } else {
      const name = isLeaf
        ? `\x1b[1;33m${folder.name}\x1b[0m`
        : `\x1b[1;36m${folder.name}\x1b[0m`;
      if (usage) {
        const tag = isLeaf ? "" : ` \x1b[90m[...]\x1b[0m`;
        lines.push(`${name}${tag} — ${usage}`);
      } else {
        lines.push(`${name}`);
      }
    }
  }

  if (lines.length === 0) {
    console.log("No non-ignored folders found.");
    return;
  }

  console.log(lines.join("\n"));
}
