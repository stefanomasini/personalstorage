import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Folder, FileBox } from 'lucide-react';
import type { FolderEntry } from '@/hooks/use-folder-navigation';

interface FolderTableProps {
    entries: FolderEntry[];
    selectedPath?: string;
    loading?: boolean;
    onNavigate: (path: string) => void;
    onSelect: (entry: FolderEntry) => void;
}

export function FolderTable({ entries, selectedPath, loading, onNavigate, onSelect }: FolderTableProps) {
    if (loading) {
        return (
            <div className="space-y-3 py-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (entries.length === 0) {
        return <p className="text-muted-foreground text-center py-8 text-sm">No folders found.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-1/4">Name</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead className="w-28">Flags</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {entries.map((entry) => (
                    <TableRow
                        key={entry.path}
                        data-state={selectedPath === entry.path ? 'selected' : undefined}
                        className={`cursor-pointer ${entry.ignore ? 'opacity-45' : ''}`}
                        onClick={() => onSelect(entry)}
                    >
                        <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                                {entry.leaf ? (
                                    <FileBox className="h-4 w-4 text-amber-600 shrink-0" />
                                ) : (
                                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                {entry.leaf ? (
                                    <span className="text-amber-700">{entry.name}</span>
                                ) : (
                                    <button
                                        className="text-primary hover:underline font-medium cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onNavigate(entry.path);
                                        }}
                                    >
                                        {entry.name}
                                    </button>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="whitespace-normal break-words">
                            {entry.usage &&
                                (entry.usageSource === 'template' ? <span className="text-muted-foreground italic">{entry.usage}</span> : entry.usage)}
                        </TableCell>
                        <TableCell>
                            <div className="flex gap-1">
                                {entry.leaf && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge variant="outline">leaf</Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>No subfolders tracked</TooltipContent>
                                    </Tooltip>
                                )}
                                {entry.ignore && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge variant="secondary">ignored</Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>Excluded from reports</TooltipContent>
                                    </Tooltip>
                                )}
                                {entry.appliedTemplate && <Badge>{entry.appliedTemplate}</Badge>}
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
