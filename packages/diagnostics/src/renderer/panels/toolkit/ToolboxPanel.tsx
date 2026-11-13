import { useMemo, useState } from 'react';
import type { ToolCategory } from '@shared/contract';
import { EmptyState, Select, type SelectGroup, type SelectItem } from '@/ui';
import { ToolRunner } from './ToolRunner';
import { useTools } from './useTools';

/** Use a picker to keep the tool form usable in narrow cells. */
export function ToolboxPanel({category, deviceId}: { readonly category: ToolCategory; readonly deviceId: string | null }) {
    const {tools, loading, error} = useTools(category);
    const [toolId, setToolId] = useState<string | null>(null);

    const groups = useMemo<SelectGroup<string>[]>(() => {
        const sections = new Map<string, SelectItem<string>[]>();

        for (const tool of tools) {
            const items = sections.get(tool.section) ?? [];
            items.push({value: tool.id, label: tool.title});
            sections.set(tool.section, items);
        }

        return Array.from(sections.entries()).map(([label, items]) => ({label, items}));
    }, [tools]);

    const selected = tools.find(tool => tool.id === toolId) ?? tools[0] ?? null;

    if (error !== null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>{error}</EmptyState>
            </div>
        );
    }

    if (loading || selected === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>{loading ? 'Loading the tools.' : 'No tools in this category.'}</EmptyState>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="shrink-0 border-b border-border p-3">
                <Select label="Tool" value={selected.id} items={groups} onValueChange={setToolId} className="w-full"/>
            </header>
            <div className="min-h-0 grow overflow-auto p-3">
                <ToolRunner tool={selected} deviceId={deviceId}/>
            </div>
        </div>
    );
}
