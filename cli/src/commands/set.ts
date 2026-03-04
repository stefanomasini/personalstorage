import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF } from "../template.js";
import type { file_properties } from "dropbox/types/dropbox_types.js";

interface SetOptions {
  usage?: string;
  ignore?: boolean;
  leaf?: boolean;
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

  if (fields.length === 0) {
    console.error("No properties specified. Use --usage, --ignore/--no-ignore, or --leaf/--no-leaf.");
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
    console.log(`  ${f.name}: ${f.value}`);
  }
}
