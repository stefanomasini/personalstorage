import path from "node:path";
import { execFileSync } from "node:child_process";
import { getClient } from "../dropbox.js";
import { getTemplateId } from "../template-id.js";
import {
  FIELD_DOCUMENT_CONTENTS_PREFIX,
  DOCUMENT_CONTENTS_FIELD_COUNT,
  DOCUMENT_CONTENTS_CHUNK_SIZE,
} from "../template.js";

function toDropboxPath(localPath: string): string {
  const absolute = path.resolve(localPath);
  const segments = absolute.split(path.sep);
  const idx = segments.indexOf("Dropbox");
  if (idx === -1) {
    throw new Error(`Cannot find "Dropbox" in path: ${absolute}`);
  }
  const relative = segments.slice(idx + 1);
  if (relative.length === 0) {
    throw new Error("Path points to the Dropbox root, not a file.");
  }
  return "/" + relative.join("/");
}

const PROMPT = `Analyze the file provided and return ONLY a JSON object (no markdown fences, no extra text) with these fields:
- "name": a short description (a handful of words) of what this file is. Don't state the obvious — for example, if it's an image, don't start with "image of...". If you can determine a meaningful date from the document content (e.g. signature date, invoice date, statement period, publication date — anything that accurately locates the document in time), prefix the name with that date followed by a space, dash and space. Use the format YYYY-MM-DD, or YYYY-MM if only month precision is available, or YYYY if only the year. If no reliable date can be extracted from the content, check the original filename for a date and use that instead. If no date can be determined at all, omit the prefix. Only use filesystem friendly characters, so avoid accents and puntuation.
- "description": ~100 words explaining what this file is and what's in it. Write it so it works well as input to an embedding model for vector search.
- "detail": optional. A markdown summary of the key details in the document, formatted for quick scanning. Omit this field if the file has no meaningful detail to extract (e.g. a simple image).

Prefer the Italian language when analyzing documents in Italian, and English for documents in English or other languages. Use the original language only for words that don't translate well, like product names, organization names, specific jargon, etc.

Return ONLY the JSON object.`;

export async function analyzeFile(localPath: string) {
  const absolute = path.resolve(localPath);
  const dropboxPath = toDropboxPath(absolute);
  console.log(`Dropbox path: ${dropboxPath}`);

  console.log("Analyzing with Claude...");
  const basename = path.basename(absolute);
  const fullPrompt = `${PROMPT}\n\nThe file to analyze is at: ${absolute}\nThe original filename is: ${basename}`;
  const raw = execFileSync(
    "claude",
    ["-p", "--allowedTools", "Read", "--output-format", "json", fullPrompt],
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );

  const response = JSON.parse(raw);
  const text: string = response.result;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not extract JSON from Claude response:\n${text}`);
  }
  const analysis = JSON.parse(jsonMatch[0]);

  console.log("\nAnalysis result:");
  console.log(`  name: ${analysis.name}`);
  console.log(`  description: ${analysis.description}`);
  if (analysis.detail) {
    console.log(`  detail: (markdown, ${analysis.detail.length} chars)`);
  }

  const dbx = getClient();
  const templateId = getTemplateId();

  const jsonStr = JSON.stringify(analysis);
  const maxSize = DOCUMENT_CONTENTS_FIELD_COUNT * DOCUMENT_CONTENTS_CHUNK_SIZE;
  if (Buffer.byteLength(jsonStr, "utf-8") > maxSize) {
    throw new Error(
      `Analysis JSON exceeds ${maxSize} bytes, cannot store in Dropbox metadata.`,
    );
  }

  const fields: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < DOCUMENT_CONTENTS_FIELD_COUNT; i++) {
    const chunk = jsonStr.slice(
      i * DOCUMENT_CONTENTS_CHUNK_SIZE,
      (i + 1) * DOCUMENT_CONTENTS_CHUNK_SIZE,
    );
    fields.push({
      name: `${FIELD_DOCUMENT_CONTENTS_PREFIX}${i + 1}`,
      value: chunk ?? "",
    });
  }

  const propertyGroup = { template_id: templateId, fields };

  try {
    await dbx.filePropertiesPropertiesAdd({
      path: dropboxPath,
      property_groups: [propertyGroup],
    });
  } catch (err: any) {
    const isAlreadyExists =
      err?.error?.error?.path?.[".tag"] === "property_group_already_exists" ||
      JSON.stringify(err?.error).includes("property_group_already_exists");

    if (isAlreadyExists) {
      await dbx.filePropertiesPropertiesUpdate({
        path: dropboxPath,
        update_property_groups: [
          { template_id: templateId, add_or_update_fields: fields },
        ],
      });
    } else {
      throw err;
    }
  }

  console.log(`\nMetadata stored on ${dropboxPath}`);
}
