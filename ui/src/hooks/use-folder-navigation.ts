import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface FolderEntry {
    path: string;
    name: string;
    usage?: string;
    usageSource?: 'own' | 'template';
    leaf?: boolean;
    ignore?: boolean;
    appliedTemplate?: string;
}

export interface FileEntry {
    name: string;
    path: string;
    hasMetadata: boolean;
    hasAnalysis: boolean;
    hasLocation: boolean;
}

interface ListData {
    children: FolderEntry[];
    files: FileEntry[];
}

type Templates = Record<string, Record<string, string>>;

export function useFolderNavigation() {
    const [currentPath, setCurrentPath] = useState('');
    const [listData, setListData] = useState<ListData | null>(null);
    const [templates, setTemplates] = useState<Templates>({});
    const [selectedEntry, setSelectedEntry] = useState<FolderEntry | null>(null);
    const [loading, setLoading] = useState(false);

    const navigateTo = useCallback(async (path: string) => {
        const normalized = path === '/' ? '' : path;
        setSelectedEntry(null);
        setLoading(true);
        setListData(null);
        try {
            const data = await api<ListData>('/api/list?path=' + encodeURIComponent(normalized));
            setCurrentPath(normalized);
            setListData(data);
            let tpl: Templates = {};
            try {
                tpl = await api<Templates>('/api/templates?path=' + encodeURIComponent(normalized));
            } catch {
                // templates may not exist
            }
            setTemplates(tpl);
        } finally {
            setLoading(false);
        }
    }, []);

    const selectFolder = useCallback((entry: FolderEntry) => {
        setSelectedEntry(entry);
    }, []);

    const deselectFolder = useCallback(() => {
        setSelectedEntry(null);
    }, []);

    const files = listData?.files ?? [];

    return {
        currentPath,
        listData,
        templates,
        selectedEntry,
        loading,
        files,
        navigateTo,
        selectFolder,
        deselectFolder,
    };
}
