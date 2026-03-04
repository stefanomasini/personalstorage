import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";

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
    console.log(`  ${field.name}: ${field.value}`);
  }
}
