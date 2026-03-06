import { useEffect } from 'react';
import { useFolderNavigation } from '@/hooks/use-folder-navigation';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { FolderTable } from '@/components/folder-table';
import { MetadataEditor } from '@/components/metadata-editor';
import { TemplateManager } from '@/components/template-manager';
import { Sheet } from '@/components/ui/sheet';

export function LiveApp() {
    const { currentPath, listData, templates, selectedEntry, loading, navigateTo, selectFolder, deselectFolder } = useFolderNavigation();

    useEffect(() => {
        navigateTo('/');
    }, [navigateTo]);

    return (
        <div className="min-h-screen">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center gap-3">
                <h1 className="text-sm font-semibold text-muted-foreground whitespace-nowrap">Storage</h1>
                <BreadcrumbNav path={currentPath || '/'} onNavigate={navigateTo} />
            </header>

            <div className="max-w-5xl mx-auto p-6 space-y-4">
                <FolderTable
                    entries={listData?.children ?? []}
                    selectedPath={selectedEntry?.path}
                    loading={loading}
                    onNavigate={navigateTo}
                    onSelect={selectFolder}
                />
                <TemplateManager path={currentPath} templates={templates} onChanged={() => navigateTo(currentPath || '/')} />
            </div>

            <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && deselectFolder()}>
                {selectedEntry && (
                    <MetadataEditor entry={selectedEntry} templates={templates} onSaved={() => navigateTo(currentPath || '/')} onCancel={deselectFolder} />
                )}
            </Sheet>
        </div>
    );
}
