import type { file_properties } from 'dropbox/types/dropbox_types.js';

export const TEMPLATE_NAME = 'personalstorage_metadata';
export const TEMPLATE_DESCRIPTION = 'Custom metadata for personal storage management';

export const FIELD_STORAGE_USAGE = 'storage_usage';
export const FIELD_STORAGE_IGNORE = 'storage_ignore';
export const FIELD_STORAGE_LEAF = 'storage_leaf';
export const FIELD_STORAGE_TEMPLATES = 'storage_templates';
export const FIELD_STORAGE_APPLIED_TEMPLATE = 'storage_applied_template';
export const FIELD_DOCUMENT_CONTENTS_PREFIX = 'document_contents_';
export const DOCUMENT_CONTENTS_FIELD_COUNT = 10;
export const DOCUMENT_CONTENTS_CHUNK_SIZE = 1024;

export const TEMPLATE_FIELDS: file_properties.PropertyFieldTemplate[] = [
    {
        name: FIELD_STORAGE_USAGE,
        description: 'Description of what this folder/file stores',
        type: { '.tag': 'string' },
    },
    {
        name: FIELD_STORAGE_IGNORE,
        description: 'Whether to ignore this path in storage reports (true/false)',
        type: { '.tag': 'string' },
    },
    {
        name: FIELD_STORAGE_LEAF,
        description: 'Whether this folder is a leaf node (true/false)',
        type: { '.tag': 'string' },
    },
    {
        name: FIELD_STORAGE_TEMPLATES,
        description: 'JSON object of folder templates (name -> subfolder -> usage)',
        type: { '.tag': 'string' },
    },
    {
        name: FIELD_STORAGE_APPLIED_TEMPLATE,
        description: 'Name of the template applied from parent folder',
        type: { '.tag': 'string' },
    },
    ...Array.from({ length: DOCUMENT_CONTENTS_FIELD_COUNT }, (_, i) => ({
        name: `${FIELD_DOCUMENT_CONTENTS_PREFIX}${i + 1}`,
        description: `AI-generated document analysis chunk ${i + 1} of ${DOCUMENT_CONTENTS_FIELD_COUNT}`,
        type: { '.tag': 'string' } as const,
    })),
];

export function reassembleDocumentContents(fields: Array<{ name: string; value: string }>): unknown | undefined {
    const chunks = fields
        .filter((f) => f.name.startsWith(FIELD_DOCUMENT_CONTENTS_PREFIX))
        .sort((a, b) => {
            const aN = parseInt(a.name.slice(FIELD_DOCUMENT_CONTENTS_PREFIX.length));
            const bN = parseInt(b.name.slice(FIELD_DOCUMENT_CONTENTS_PREFIX.length));
            return aN - bN;
        });

    const joined = chunks.map((c) => c.value).join('');
    if (!joined) return undefined;

    try {
        return JSON.parse(joined);
    } catch {
        return undefined;
    }
}
