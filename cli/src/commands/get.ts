import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_TEMPLATES, FIELD_DOCUMENT_CONTENTS_PREFIX, reassembleDocumentContents } from "../template.js";

export async function getMetadata(filePath: string) {
  const dbx = getClient();
  const templateId = getTemplateId();

  const response = await (dbx as any).filesGetMetadata({
    path: filePath,
    include_property_groups: {
      ".tag": "filter_some",
      filter_some: [templateId],
    },
  });

  const propertyGroups = response.result.property_groups;
  if (!propertyGroups || propertyGroups.length === 0) {
    console.log(`No metadata found on ${filePath}`);
    return;
  }

  const group = propertyGroups.find(
    (g: any) => g.template_id === templateId
  );
  if (!group) {
    console.log(`No personalstorage metadata found on ${filePath}`);
    return;
  }

  console.log(`Metadata for ${filePath}:`);
  for (const field of group.fields) {
    if (field.name.startsWith(FIELD_DOCUMENT_CONTENTS_PREFIX)) continue;
    if (field.name === FIELD_STORAGE_TEMPLATES && field.value) {
      try {
        const templates = JSON.parse(field.value);
        console.log(`  ${field.name}:`);
        for (const [name, subfolders] of Object.entries(templates)) {
          console.log(`    ${name}:`);
          for (const [sub, usage] of Object.entries(subfolders as Record<string, string>)) {
            console.log(`      ${sub}: ${usage}`);
          }
        }
      } catch {
        console.log(`  ${field.name}: ${field.value}`);
      }
    } else {
      console.log(`  ${field.name}: ${field.value}`);
    }
  }

  const docContents = reassembleDocumentContents(group.fields);
  if (docContents && typeof docContents === "object") {
    const doc = docContents as Record<string, string>;
    console.log(`  document_contents:`);
    if (doc.name) console.log(`    name: ${doc.name}`);
    if (doc.description) console.log(`    description: ${doc.description}`);
    if (doc.detail) console.log(`    detail: ${doc.detail}`);
  }
}
