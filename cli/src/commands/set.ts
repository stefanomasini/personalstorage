import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF, FIELD_STORAGE_TEMPLATES, FIELD_STORAGE_APPLIED_TEMPLATE } from "../template.js";
import { fetchExistingTemplates, getParentPath, type Templates } from "../metadata.js";
import type { file_properties } from "dropbox/types/dropbox_types.js";

export interface SetOptions {
  usage?: string;
  ignore?: boolean;
  leaf?: boolean;
  template?: string[];
  removeTemplate?: string;
  removeTemplateEntry?: string[];
  applyTemplate?: string | boolean;
}

export async function applyMetadata(filePath: string, options: SetOptions): Promise<file_properties.PropertyField[]> {
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
        throw new Error("--template requires exactly 3 arguments: <name> <subfolder> <usage>");
      }
      const [name, subfolder, usage] = options.template;
      if (!templates[name]) templates[name] = {};
      templates[name][subfolder] = usage;
    }

    if (options.removeTemplate) {
      const name = options.removeTemplate;
      if (!templates[name]) {
        throw new Error(`Template "${name}" not found.`);
      }
      delete templates[name];
    }

    if (options.removeTemplateEntry) {
      if (options.removeTemplateEntry.length !== 2) {
        throw new Error("--remove-template-entry requires exactly 2 arguments: <name> <subfolder>");
      }
      const [name, subfolder] = options.removeTemplateEntry;
      if (!templates[name]?.[subfolder]) {
        throw new Error(`Template entry "${name}/${subfolder}" not found.`);
      }
      delete templates[name][subfolder];
      if (Object.keys(templates[name]).length === 0) {
        delete templates[name];
      }
    }

    fields.push({ name: FIELD_STORAGE_TEMPLATES, value: JSON.stringify(templates) });
  }

  if (options.applyTemplate === false) {
    fields.push({ name: FIELD_STORAGE_APPLIED_TEMPLATE, value: "" });
  } else if (typeof options.applyTemplate === "string") {
    const parentPath = getParentPath(filePath);
    const parentTemplates = await fetchExistingTemplates(parentPath);
    if (!parentTemplates[options.applyTemplate]) {
      throw new Error(`Template "${options.applyTemplate}" not found on parent folder "${parentPath || "/"}".`);
    }
    fields.push({ name: FIELD_STORAGE_APPLIED_TEMPLATE, value: options.applyTemplate });
  }

  if (fields.length === 0) {
    throw new Error("No properties specified. Use --usage, --ignore/--no-ignore, --leaf/--no-leaf, --template, or --apply-template.");
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

  return fields;
}

export async function setMetadata(filePath: string, options: SetOptions) {
  try {
    const fields = await applyMetadata(filePath, options);

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
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
