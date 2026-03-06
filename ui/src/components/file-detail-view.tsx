import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { FileEntry } from '@/hooks/use-folder-navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FileDetailViewProps {
    file: FileEntry;
    files: FileEntry[];
    onBack: () => void;
    onNavigateFile: (file: FileEntry) => void;
}

export function FileDetailView({ file, files, onBack, onNavigateFile }: FileDetailViewProps) {
    const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
    const [loading, setLoading] = useState(true);
    const [suggesting, setSuggesting] = useState(false);

    const currentIndex = files.findIndex((f) => f.path === file.path);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < files.length - 1;

    useEffect(() => {
        setLoading(true);
        api<Record<string, string>>('/api/get?path=' + encodeURIComponent(file.path))
            .then(setMetadata)
            .catch(() => setMetadata(null))
            .finally(() => setLoading(false));
    }, [file.path]);

    let docName: string | undefined;
    let docDescription: string | undefined;
    let docDetail: string | undefined;
    let documentLocation: string | undefined;
    const otherFields: [string, string][] = [];

    if (metadata) {
        if (metadata.document_contents) {
            try {
                const parsed = JSON.parse(metadata.document_contents);
                docName = parsed.name;
                docDescription = parsed.description;
                docDetail = parsed.detail;
            } catch {
                // show raw if unparseable
            }
        }
        documentLocation = metadata.document_location;

        for (const [key, value] of Object.entries(metadata)) {
            if (key === 'document_contents' || key === 'document_location') continue;
            if (value) otherFields.push([key, value]);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" disabled={!hasPrev} onClick={() => onNavigateFile(files[currentIndex - 1])}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {currentIndex + 1} / {files.length}
                </span>
                <Button variant="ghost" size="icon" disabled={!hasNext} onClick={() => onNavigateFile(files[currentIndex + 1])}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <h2 className="text-lg font-semibold break-all">{file.name}</h2>

            {loading ? (
                <div className="space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : !metadata || Object.keys(metadata).length === 0 ? (
                <p className="text-sm text-muted-foreground">No metadata found for this file.</p>
            ) : (
                <div className="space-y-4">
                    {documentLocation ? (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Suggested Location</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <code className="text-sm bg-muted px-2 py-1 rounded">{documentLocation}</code>
                            </CardContent>
                        </Card>
                    ) : metadata?.document_contents ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={suggesting}
                            onClick={async () => {
                                setSuggesting(true);
                                try {
                                    const res = await api<{ location: string }>('/api/decide-location', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ path: file.path }),
                                    });
                                    setMetadata((prev) => prev ? { ...prev, document_location: res.location } : prev);
                                } catch {
                                    // ignore
                                } finally {
                                    setSuggesting(false);
                                }
                            }}
                        >
                            {suggesting ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4 mr-1" />
                            )}
                            {suggesting ? 'Suggesting...' : 'Suggest location'}
                        </Button>
                    ) : null}

                    {(docName || docDescription) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">{docName || 'Document Analysis'}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {docDescription && <p className="text-sm text-muted-foreground">{docDescription}</p>}
                            </CardContent>
                        </Card>
                    )}

                    {docDetail && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Detail</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{docDetail}</ReactMarkdown>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {otherFields.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Other Metadata</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <dl className="space-y-2">
                                    {otherFields.map(([key, value]) => (
                                        <div key={key}>
                                            <dt className="text-xs font-medium text-muted-foreground">{key}</dt>
                                            <dd className="text-sm">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
