import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF, FIELD_STORAGE_TEMPLATES } from "../template.js";
import type { file_properties } from "dropbox/types/dropbox_types.js";

interface SetOptions {
  usage?: string;
  ignore?: boolean;
  leaf?: boolean;
  template?: string[];
  removeTemplate?: string;
  removeTemplateEntry?: string[];
}

type Templates = Record<string, Record<string, string>>;

async function fetchExistingTemplates(filePath: string): Promise<Templates> {
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

export async function setMetadata(filePath: string, options: SetOptions) {
  const dbx = getClient();
  const templateId = getTemplateId();

  const fields: file_properties.PropertyField[] = [];
  if (options.usage !== undefined) {
    fields.push({ name: FIELD_STORAGE_USAGE, value: options.usage });
  }
  if (options.ignore !== undefined) {
    fields.push({
      name: FIELD_STORAGE_IGNORE,
      value: String(options.ignore),
    });
  }
  if (options.leaf !== undefined) {
    fields.push({
      name: FIELD_STORAGE_LEAF,
      value: String(options.leaf),
    });
  }

  const hasTemplateOp = options.template || options.removeTemplate || options.removeTemplateEntry;

  if (hasTemplateOp) {
    const templates = await fetchExistingTemplates(filePath);

    if (options.template) {
      if (options.template.length !== 3) {
        console.error("--template requires exactly 3 arguments: <name> <subfolder> <usage>");
        process.exit(1);
      }
      const [name, subfolder, usage] = options.template;
      if (!templates[name]) templates[name] = {};
      templates[name][subfolder] = usage;
    }

    if (options.removeTemplate) {
      const name = options.removeTemplate;
      if (!templates[name]) {
        console.error(`Template "${name}" not found.`);
        process.exit(1);
      }
      delete templates[name];
    }

    if (options.removeTemplateEntry) {
      if (options.removeTemplateEntry.length !== 2) {
        console.error("--remove-template-entry requires exactly 2 arguments: <name> <subfolder>");
        process.exit(1);
      }
      const [name, subfolder] = options.removeTemplateEntry;
      if (!templates[name]?.[subfolder]) {
        console.error(`Template entry "${name}/${subfolder}" not found.`);
        process.exit(1);
      }
      delete templates[name][subfolder];
      if (Object.keys(templates[name]).length === 0) {
        delete templates[name];
      }
    }

    fields.push({ name: FIELD_STORAGE_TEMPLATES, value: JSON.stringify(templates) });
  }

  if (fields.length === 0) {
    console.error("No properties specified. Use --usage, --ignore/--no-ignore, --leaf/--no-leaf, or --template.");
    process.exit(1);
  }

  const propertyGroup: file_properties.PropertyGroup = {
    template_id: templateId,
    fields,
  };

  try {
    await dbx.filePropertiesPropertiesAdd({
      path: filePath,
      property_groups: [propertyGroup],
    });
  } catch (err: any) {
    const isAlreadyExists =
      err?.error?.error?.path?.[".tag"] === "property_group_already_exists" ||
      JSON.stringify(err?.error).includes("property_group_already_exists");

    if (isAlreadyExists) {
      const updateFields = fields.map((f) => ({
        name: f.name,
        value: f.value,
      }));
      await dbx.filePropertiesPropertiesUpdate({
        path: filePath,
        update_property_groups: [
          { template_id: templateId, add_or_update_fields: updateFields },
        ],
      });
    } else {
      throw err;
    }
  }

  console.log(`Metadata set on ${filePath}`);
  for (const f of fields) {
    if (f.name === FIELD_STORAGE_TEMPLATES) {
      const templates: Templates = JSON.parse(f.value);
      console.log(`  ${f.name}:`);
      for (const [name, subfolders] of Object.entries(templates)) {
        console.log(`    ${name}:`);
        for (const [sub, usage] of Object.entries(subfolders)) {
          console.log(`      ${sub}: ${usage}`);
        }
      }
    } else {
      console.log(`  ${f.name}: ${f.value}`);
    }
  }
}
