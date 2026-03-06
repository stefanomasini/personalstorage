import { useState, useEffect } from 'react';
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { FolderEntry } from '@/hooks/use-folder-navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface MetadataEditorProps {
    entry: FolderEntry;
    templates: Record<string, Record<string, string>>;
    onSaved: () => void;
    onCancel: () => void;
}

const NONE = '__none__';

export function MetadataEditor({ entry, templates, onSaved, onCancel }: MetadataEditorProps) {
    const [usage, setUsage] = useState('');
    const [leaf, setLeaf] = useState(false);
    const [ignore, setIgnore] = useState(false);
    const [applyTemplate, setApplyTemplate] = useState(NONE);

    useEffect(() => {
        setUsage(entry.usageSource === 'own' ? (entry.usage ?? '') : '');
        setLeaf(!!entry.leaf);
        setIgnore(!!entry.ignore);
        setApplyTemplate(entry.appliedTemplate ?? NONE);
    }, [entry]);

    const templateNames = Object.keys(templates);

    async function save() {
        const payload: Record<string, unknown> = {
            path: entry.path,
            usage,
            leaf,
            ignore,
        };

        const currentTemplate = entry.appliedTemplate ?? NONE;
        if (applyTemplate !== currentTemplate) {
            payload.applyTemplate = applyTemplate === NONE ? false : applyTemplate;
        }

        try {
            await api('/api/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            toast.success('Metadata saved');
            onSaved();
        } catch (err) {
            toast.error((err as Error).message);
        }
    }

    return (
        <SheetContent>
            <SheetHeader>
                <SheetTitle>{entry.name}</SheetTitle>
                <SheetDescription>{entry.path}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
                <div className="space-y-2">
                    <Label htmlFor="ed-usage">Usage</Label>
                    <Input id="ed-usage" value={usage} onChange={(e) => setUsage(e.target.value)} placeholder="Description of folder usage" />
                </div>

                <div className="flex items-center gap-2">
                    <Checkbox id="ed-leaf" checked={leaf} onCheckedChange={(v) => setLeaf(!!v)} />
                    <Label htmlFor="ed-leaf">Leaf</Label>
                </div>

                <div className="flex items-center gap-2">
                    <Checkbox id="ed-ignore" checked={ignore} onCheckedChange={(v) => setIgnore(!!v)} />
                    <Label htmlFor="ed-ignore">Ignore</Label>
                </div>

                {templateNames.length > 0 && (
                    <div className="space-y-2">
                        <Label>Apply template</Label>
                        <Select value={applyTemplate} onValueChange={setApplyTemplate}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>(none)</SelectItem>
                                {templateNames.map((name) => (
                                    <SelectItem key={name} value={name}>
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <Button onClick={save}>Save</Button>
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </SheetContent>
    );
}
