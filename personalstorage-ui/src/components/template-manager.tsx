import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type Templates = Record<string, Record<string, string>>;

interface TemplateManagerProps {
    path: string;
    templates: Templates;
    onChanged: () => void;
}

export function TemplateManager({ path, templates, onChanged }: TemplateManagerProps) {
    const [name, setName] = useState('');
    const [sub, setSub] = useState('');
    const [usage, setUsage] = useState('');

    const entries: { tplName: string; subName: string; usage: string }[] = [];
    for (const [tplName, subs] of Object.entries(templates)) {
        for (const [subName, u] of Object.entries(subs)) {
            entries.push({ tplName, subName, usage: u });
        }
    }

    const [open, setOpen] = useState(entries.length > 0);

    async function addEntry() {
        if (!name || !sub || !usage) {
            toast.error('Fill all template fields');
            return;
        }
        try {
            await api('/api/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, template: [name, sub, usage] }),
            });
            setName('');
            setSub('');
            setUsage('');
            toast.success('Template entry added');
            onChanged();
        } catch (err) {
            toast.error((err as Error).message);
        }
    }

    async function removeEntry(tplName: string, subName: string) {
        try {
            await api('/api/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, removeTemplateEntry: [tplName, subName] }),
            });
            toast.success('Template entry removed');
            onChanged();
        } catch (err) {
            toast.error((err as Error).message);
        }
    }

    return (
        <Card>
            <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
                <CardTitle className="text-sm flex items-center gap-1.5">
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Templates on {path || '/'}
                    {entries.length > 0 && <span className="text-muted-foreground font-normal">({entries.length})</span>}
                </CardTitle>
            </CardHeader>
            {open && (
                <CardContent className="space-y-2">
                    {entries.map((e) => (
                        <div key={e.tplName + '/' + e.subName} className="flex items-center justify-between text-sm">
                            <span>
                                <span className="font-medium">
                                    {e.tplName}/{e.subName}
                                </span>{' '}
                                <span className="text-muted-foreground">{e.usage}</span>
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeEntry(e.tplName, e.subName)}>
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                        <Input placeholder="template" value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
                        <Input placeholder="subfolder" value={sub} onChange={(e) => setSub(e.target.value)} className="text-sm" />
                        <Input placeholder="usage" value={usage} onChange={(e) => setUsage(e.target.value)} className="text-sm" />
                        <Button variant="outline" size="sm" onClick={addEntry}>
                            +
                        </Button>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
