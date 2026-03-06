import { getClient } from '../dropbox.js';
import { getTemplateId } from '../template-id.js';
import { FIELD_STORAGE_USAGE, FIELD_STORAGE_IGNORE, FIELD_STORAGE_LEAF, FIELD_STORAGE_APPLIED_TEMPLATE } from '../template.js';
import { fetchExistingTemplates, fetchFieldValue, getParentPath } from '../metadata.js';

interface CheckOptions {
    markdown?: boolean;
    verbose?: boolean;
}

interface UnannontatedFolder {
    path: string;
    usage: string | undefined;
}

interface TemplateInconsistency {
    path: string;
    ownUsage: string;
    templateUsage: string;
}

export async function checkMetadata(options: CheckOptions = {}) {
    const dbx = getClient();
    const templateId = getTemplateId();
    const useMarkdown = options.markdown || !process.stdout.isTTY;
    const unannotated: UnannontatedFolder[] = [];
    const inconsistencies: TemplateInconsistency[] = [];

    async function listChildren(folderPath: string) {
        if (options.verbose) console.error(`listing: ${folderPath || '/'}`);
        const entries: any[] = [];
        let response = await (dbx as any).filesListFolder({
            path: folderPath,
            include_property_groups: {
                '.tag': 'filter_some',
                filter_some: [templateId],
            },
        });
        entries.push(...response.result.entries);

        while (response.result.has_more) {
            if (options.verbose) console.error(`listing (continue): ${folderPath || '/'}`);
            response = await (dbx as any).filesListFolderContinue({
                cursor: response.result.cursor,
            });
            entries.push(...response.result.entries);
        }

        return entries.filter((e: any) => e['.tag'] === 'folder');
    }

    function getFields(folder: any) {
        const group = folder.property_groups?.find((g: any) => g.template_id === templateId);
        const fields = group?.fields ?? [];
        return {
            hasMetadata: !!group,
            ignore: fields.find((f: any) => f.name === FIELD_STORAGE_IGNORE)?.value,
            usage: fields.find((f: any) => f.name === FIELD_STORAGE_USAGE)?.value,
            leaf: fields.find((f: any) => f.name === FIELD_STORAGE_LEAF)?.value,
        };
    }

    async function visit(folderPath: string) {
        const children = await listChildren(folderPath);

        // Resolve applied template if present
        let templateEntries: Record<string, string> = {};
        if (folderPath) {
            const appliedTemplateName = await fetchFieldValue(folderPath, FIELD_STORAGE_APPLIED_TEMPLATE);
            if (appliedTemplateName) {
                const parentPath = getParentPath(folderPath);
                const parentTemplates = await fetchExistingTemplates(parentPath);
                templateEntries = parentTemplates[appliedTemplateName] ?? {};
            }
        }

        const nonIgnored = children.filter((c: any) => {
            const { ignore } = getFields(c);
            return ignore !== 'true';
        });

        for (const child of nonIgnored) {
            const { leaf, usage, hasMetadata } = getFields(child);
            if (leaf === 'true') continue;

            const templateUsage = templateEntries[child.name];

            if (hasMetadata) {
                if (templateUsage && usage && usage !== templateUsage) {
                    inconsistencies.push({
                        path: child.path_display,
                        ownUsage: usage,
                        templateUsage,
                    });
                }
                if (!templateUsage) {
                    await visit(child.path_display);
                }
            } else if (!templateUsage) {
                unannotated.push({ path: child.path_display, usage });
            }
        }
    }

    await visit('');

    const lines: string[] = [];

    if (inconsistencies.length > 0) {
        for (const { path, ownUsage, templateUsage } of inconsistencies) {
            if (useMarkdown) {
                lines.push(`- **${path}** — usage "${ownUsage}" differs from template "${templateUsage}"`);
            } else {
                const name = `\x1b[1;35m${path}\x1b[0m`;
                lines.push(`  ${name} — usage \x1b[33m"${ownUsage}"\x1b[0m differs from template \x1b[36m"${templateUsage}"\x1b[0m`);
            }
        }

        const incSummary = `${inconsistencies.length} folder(s) with usage inconsistent with applied template.`;
        if (useMarkdown) {
            lines.push(`\n**${incSummary}**`);
        } else {
            lines.push(`\n\x1b[1;35m${incSummary}\x1b[0m`);
        }
    }

    if (unannotated.length > 0) {
        if (lines.length > 0) lines.push('');

        for (const { path, usage } of unannotated) {
            const description = usage || '(no usage set)';

            if (useMarkdown) {
                lines.push(`- **${path}** — ${description}`);
            } else {
                const name = `\x1b[1;36m${path}\x1b[0m`;
                const desc = usage ? `\x1b[0m${usage}\x1b[0m` : `\x1b[90m(no usage set)\x1b[0m`;
                lines.push(`  ${name} — ${desc}`);
            }
        }

        lines.push('');
        const summary = `${unannotated.length} terminal folder(s) not marked as leaf.`;
        if (useMarkdown) {
            lines.push(`**${summary}**`);
        } else {
            lines.push(`\x1b[1;33m${summary}\x1b[0m`);
        }
    }

    if (lines.length === 0) {
        console.log('All terminal folders are properly annotated as leaf.');
        return;
    }

    console.log(lines.join('\n'));
}
