import fs from 'node:fs';
import path from 'node:path';
import { getClient } from '../dropbox.js';
import { TEMPLATE_NAME, TEMPLATE_DESCRIPTION, TEMPLATE_FIELDS } from '../template.js';

const TEMPLATE_ID_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), '../../.template-id');

export async function initTemplate() {
    const dbx = getClient();

    const existingId = fs.existsSync(TEMPLATE_ID_FILE) ? fs.readFileSync(TEMPLATE_ID_FILE, 'utf-8').trim() : null;

    if (existingId) {
        await dbx.filePropertiesTemplatesUpdateForUser({
            template_id: existingId,
            name: TEMPLATE_NAME,
            description: TEMPLATE_DESCRIPTION,
            add_fields: TEMPLATE_FIELDS,
        });
        console.log(`Template updated: ${existingId}`);
        return;
    }

    const response = await dbx.filePropertiesTemplatesAddForUser({
        name: TEMPLATE_NAME,
        description: TEMPLATE_DESCRIPTION,
        fields: TEMPLATE_FIELDS,
    });

    const templateId = response.result.template_id;
    fs.writeFileSync(TEMPLATE_ID_FILE, templateId, 'utf-8');
    console.log(`Template created: ${templateId}`);
    console.log(`Saved to ${TEMPLATE_ID_FILE}`);
}
