import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF, FIELD_STORAGE_APPLIED_TEMPLATE } from '../template.js';
import { fetchExistingTemplates, fetchFieldValue, getParentPath } from '../metadata.js';

export interface FolderEntry {
    name: string;
    path: string;
    usage: string | undefined;
    usageSource: 'own' | 'template' | null;
    leaf: boolean;
    ignore: boolean;
    hasMetadata: boolean;
    appliedTemplate: string | undefined;
}

export interface ListResult {
    path: string;
    appliedTemplate: string | undefined;
    children: FolderEntry[];
}

export async function listFolderData(folderPath: string): Promise<ListResult> {
    const dbx = getClient();
    const templateId = getTemplateId();

    let entries: any[] = [];
    let response = await (dbx as any).filesListFolder({
        path: folderPath,
        include_property_groups: {
            '.tag': 'filter_some',
            filter_some: [templateId],
        },
    });
    entries.push(...response.result.entries);

    while (response.result.has_more) {
        response = await (dbx as any).filesListFolderContinue({
            cursor: response.result.cursor,
        });
        entries.push(...response.result.entries);
    }

    const folders = entries.filter((e: any) => e['.tag'] === 'folder').sort((a: any, b: any) => a.name.localeCompare(b.name));

    const appliedTemplateName = await fetchFieldValue(folderPath, FIELD_STORAGE_APPLIED_TEMPLATE);
    let templateEntries: Record<string, string> = {};
    if (appliedTemplateName && appliedTemplateName !== '') {
        const parentPath = getParentPath(folderPath);
        const parentTemplates = await fetchExistingTemplates(parentPath);
        templateEntries = parentTemplates[appliedTemplateName] ?? {};
    }

    const children: FolderEntry[] = [];
    for (const folder of folders) {
        const group = folder.property_groups?.find((g: any) => g.template_id === templateId);
        const fields = group?.fields ?? [];
        const ignore = fields.find((f: any) => f.name === FIELD_STORAGE_IGNORE)?.value === 'true';
        const leaf = fields.find((f: any) => f.name === FIELD_STORAGE_LEAF)?.value === 'true' || folder.name in templateEntries;
        const ownUsage = fields.find((f: any) => f.name === FIELD_STORAGE_USAGE)?.value || undefined;
        const tplUsage = templateEntries[folder.name] || undefined;
        const folderAppliedTemplate = fields.find((f: any) => f.name === FIELD_STORAGE_APPLIED_TEMPLATE)?.value || undefined;

        children.push({
            name: folder.name,
            path: folder.path_lower ?? folder.path_display,
            usage: ownUsage || tplUsage,
            usageSource: ownUsage ? 'own' : tplUsage ? 'template' : null,
            leaf,
            ignore,
            hasMetadata: !!group,
            appliedTemplate: folderAppliedTemplate,
        });
    }

    return {
        path: folderPath || '/',
        appliedTemplate: appliedTemplateName || undefined,
        children,
    };
}

interface ListOptions {
    markdown?: boolean;
}

export async function listMetadata(folderPath: string, options: ListOptions = {}) {
    const result = await listFolderData(folderPath);
    const visibleChildren = result.children.filter((c) => !c.ignore);

    if (visibleChildren.length === 0) {
        console.log('No non-ignored folders found.');
        return;
    }

    const useMarkdown = options.markdown || !process.stdout.isTTY;
    const lines: string[] = [];

    for (const child of visibleChildren) {
        if (useMarkdown) {
            lines.push(child.usage ? `- **${child.name}** — ${child.usage}` : `- **${child.name}**`);
        } else {
            const name = child.leaf ? `\x1b[1;33m${child.name}\x1b[0m` : `\x1b[1;36m${child.name}\x1b[0m`;
            if (child.usage) {
                const tag = child.leaf ? '' : ` \x1b[90m[...]\x1b[0m`;
                lines.push(`${name}${tag} — ${child.usage}`);
            } else {
                lines.push(name);
            }
        }
    }

    console.log(lines.join('\n'));
}
