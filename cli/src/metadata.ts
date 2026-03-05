import { getClient } from "./dropbox.js";
import { getTemplateId } from "./template-id.js";
import { FIELD_STORAGE_TEMPLATES } from "./template.js";

export type Templates = Record<string, Record<string, string>>;

export function getParentPath(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

export async function fetchExistingTemplates(filePath: string): Promise<Templates> {
  const dbx = getClient();
  const templateId = getTemplateId();

  try {
    const response = await (dbx as any).filesGetMetadata({
      path: filePath,
      include_property_groups: {
        ".tag": "filter_some",
        filter_some: [templateId],
      },
    });

    const group = response.result.property_groups?.find(
      (g: any) => g.template_id === templateId
    );
    if (!group) return {};

    const field = group.fields.find((f: any) => f.name === FIELD_STORAGE_TEMPLATES);
    if (!field?.value) return {};

    return JSON.parse(field.value);
  } catch {
    return {};
  }
}

export async function fetchFieldValue(filePath: string, fieldName: string): Promise<string | undefined> {
  const dbx = getClient();
  const templateId = getTemplateId();

  try {
    const response = await (dbx as any).filesGetMetadata({
      path: filePath,
      include_property_groups: {
        ".tag": "filter_some",
        filter_some: [templateId],
      },
    });

    const group = response.result.property_groups?.find(
      (g: any) => g.template_id === templateId
    );
    if (!group) return undefined;

    return group.fields.find((f: any) => f.name === fieldName)?.value;
  } catch {
    return undefined;
  }
}
