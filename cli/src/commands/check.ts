import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF } from "../template.js";

interface CheckOptions {
  markdown?: boolean;
  verbose?: boolean;
}

interface UnannontatedFolder {
  path: string;
  usage: string | undefined;
}

export async function checkMetadata(options: CheckOptions = {}) {
  const dbx = getClient();
  const templateId = getTemplateId();
  const useMarkdown = options.markdown || !process.stdout.isTTY;
  const unannotated: UnannontatedFolder[] = [];

  async function listChildren(folderPath: string) {
    if (options.verbose) console.error(`listing: ${folderPath || "/"}`);
    const entries: any[] = [];
    let response = await (dbx as any).filesListFolder({
      path: folderPath,
      include_property_groups: {
        ".tag": "filter_some",
        filter_some: [templateId],
      },
    });
    entries.push(...response.result.entries);

    while (response.result.has_more) {
      if (options.verbose) console.error(`listing (continue): ${folderPath || "/"}`);
      response = await (dbx as any).filesListFolderContinue({
        cursor: response.result.cursor,
      });
      entries.push(...response.result.entries);
    }

    return entries.filter((e: any) => e[".tag"] === "folder");
  }

  function getFields(folder: any) {
    const group = folder.property_groups?.find(
      (g: any) => g.template_id === templateId
    );
    const fields = group?.fields ?? [];
    return {
      hasMetadata: !!group,
      ignore: fields.find((f: any) => f.name === FIELD_STORAGE_IGNORE)?.value,
      usage: fields.find((f: any) => f.name === FIELD_STORAGE_USAGE)?.value,
      leaf: fields.find((f: any) => f.name === FIELD_STORAGE_LEAF)?.value,
    };
  }

  async function visit(folderPath: string) {
    const children = await listChildren(folderPath);

    const nonIgnored = children.filter((c: any) => {
      const { ignore } = getFields(c);
      return ignore !== "true";
    });

    for (const child of nonIgnored) {
      const { leaf, usage, hasMetadata } = getFields(child);
      if (leaf === "true") continue;
      if (hasMetadata) {
        await visit(child.path_display);
      } else {
        unannotated.push({ path: child.path_display, usage });
      }
    }
  }

  await visit("");

  if (unannotated.length === 0) {
    console.log("All terminal folders are properly annotated as leaf.");
    return;
  }

  const lines: string[] = [];
  for (const { path, usage } of unannotated) {
    const description = usage || "(no usage set)";

    if (useMarkdown) {
      lines.push(`- **${path}** — ${description}`);
    } else {
      const name = `\x1b[1;36m${path}\x1b[0m`;
      const desc = usage
        ? `\x1b[0m${usage}\x1b[0m`
        : `\x1b[90m(no usage set)\x1b[0m`;
      lines.push(`  ${name} — ${desc}`);
    }
  }

  lines.push("");
  const summary = `${unannotated.length} terminal folder(s) not marked as leaf.`;
  if (useMarkdown) {
    lines.push(`**${summary}**`);
  } else {
    lines.push(`\x1b[1;33m${summary}\x1b[0m`);
  }

  console.log(lines.join("\n"));
}
