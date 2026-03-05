import type { file_properties } from "dropbox/types/dropbox_types.js";

export const TEMPLATE_NAME = "personalstorage_metadata";
export const TEMPLATE_DESCRIPTION = "Custom metadata for personal storage management";

export const FIELD_STORAGE_USAGE = "storage_usage";
export const FIELD_STORAGE_IGNORE = "storage_ignore";
export const FIELD_STORAGE_LEAF = "storage_leaf";
export const FIELD_STORAGE_TEMPLATES = "storage_templates";

export const TEMPLATE_FIELDS: file_properties.PropertyFieldTemplate[] = [
  {
    name: FIELD_STORAGE_USAGE,
    description: "Description of what this folder/file stores",
    type: { ".tag": "string" },
  },
  {
    name: FIELD_STORAGE_IGNORE,
    description: "Whether to ignore this path in storage reports (true/false)",
    type: { ".tag": "string" },
  },
  {
    name: FIELD_STORAGE_LEAF,
    description: "Whether this folder is a leaf node (true/false)",
    type: { ".tag": "string" },
  },
  {
    name: FIELD_STORAGE_TEMPLATES,
    description: "JSON object of folder templates (name -> subfolder -> usage)",
    type: { ".tag": "string" },
  },
];
