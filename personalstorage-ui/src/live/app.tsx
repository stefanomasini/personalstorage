import { useEffect, useState } from 'react';
import { useFolderNavigation, type FileEntry } from '@/hooks/use-folder-navigation';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { FolderTable } from '@/components/folder-table';
import { FileList } from '@/components/file-list';
import { FileDetailView } from '@/components/file-detail-view';
import { MetadataEditor } from '@/components/metadata-editor';
import { TemplateManager } from '@/components/template-manager';
import { Sheet } from '@/components/ui/sheet';

type View = { kind: 'folder' } | { kind: 'file'; file: FileEntry };

export function LiveApp() {
    const { currentPath, listData, templates, selectedEntry, loading, files, navigateTo, selectFolder, deselectFolder } = useFolderNavigation();
    const [view, setView] = useState<View>({ kind: 'folder' });

    useEffect(() => {
        navigateTo('/');
    }, [navigateTo]);

    // Reset to folder view when navigating to a new folder
    useEffect(() => {
        setView({ kind: 'folder' });
    }, [currentPath]);

    return (
        <div className="min-h-screen">
            <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-6 py-4 flex items-center gap-3">
                <h1 className="text-sm font-semibold text-muted-foreground whitespace-nowrap">Storage</h1>
                <BreadcrumbNav path={currentPath || '/'} onNavigate={navigateTo} />
            </header>

            <div className="max-w-5xl mx-auto p-6 space-y-4">
                {view.kind === 'folder' ? (
                    <>
                        <FolderTable
                            entries={listData?.children ?? []}
                            selectedPath={selectedEntry?.path}
                            loading={loading}
                            onNavigate={navigateTo}
                            onSelect={selectFolder}
                        />
                        <FileList files={files} onSelectFile={(f) => setView({ kind: 'file', file: f })} />
                        <TemplateManager path={currentPath} templates={templates} onChanged={() => navigateTo(currentPath || '/')} />
                    </>
                ) : (
                    <FileDetailView
                        file={view.file}
                        files={files}
                        onBack={() => setView({ kind: 'folder' })}
                        onNavigateFile={(f) => setView({ kind: 'file', file: f })}
                        onFileMoved={(movedFile) => {
                            const remaining = files.filter((f) => f.path !== movedFile.path);
                            if (remaining.length === 0) {
                                setView({ kind: 'folder' });
                            } else {
                                const idx = files.findIndex((f) => f.path === movedFile.path);
                                const next = remaining[Math.min(idx, remaining.length - 1)];
                                setView({ kind: 'file', file: next });
                            }
                            navigateTo(currentPath || '/');
                        }}
                    />
                )}
            </div>

            <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && deselectFolder()}>
                {selectedEntry && (
                    <MetadataEditor entry={selectedEntry} templates={templates} onSaved={() => navigateTo(currentPath || '/')} onCancel={deselectFolder} />
                )}
            </Sheet>
        </div>
    );
}
