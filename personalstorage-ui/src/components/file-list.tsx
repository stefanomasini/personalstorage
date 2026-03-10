import { File, ClipboardCheck, Brain, MapPin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FileEntry } from '@/hooks/use-folder-navigation';

interface FileListProps {
    files: FileEntry[];
    onSelectFile: (file: FileEntry) => void;
}

export function FileList({ files, onSelectFile }: FileListProps) {
    if (files.length === 0) return null;

    return (
        <div className="space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 pb-1">Files</h3>
            {files.map((file) => (
                <button
                    key={file.path}
                    className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent text-left cursor-pointer transition-colors"
                    onClick={() => onSelectFile(file)}
                >
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{file.name}</span>
                    <div className="flex items-center gap-1.5">
                        <StatusIcon icon={ClipboardCheck} active={file.hasMetadata} tooltip="Has metadata" />
                        <StatusIcon icon={Brain} active={file.hasAnalysis} tooltip="Analysis done" />
                        <StatusIcon icon={MapPin} active={file.hasLocation} tooltip="Location suggested" />
                    </div>
                </button>
            ))}
        </div>
    );
}

function StatusIcon({ icon: Icon, active, tooltip }: { icon: React.ComponentType<any>; active: boolean; tooltip: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-foreground' : 'text-muted-foreground/30'}`} />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    );
}
