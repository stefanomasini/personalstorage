import fs from "node:fs";
import path from "node:path";

const TEMPLATE_ID_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../.template-id"
);

export function getTemplateId(): string {
  const fromEnv = process.env.DROPBOX_TEMPLATE_ID;
  if (fromEnv) return fromEnv;

  try {
    return fs.readFileSync(TEMPLATE_ID_FILE, "utf-8").trim();
  } catch {
    console.error(
      "Template ID not found. Run 'storage-cli init' first, or set DROPBOX_TEMPLATE_ID."
    );
    process.exit(1);
  }
}
