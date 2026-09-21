import { useMemo, useState } from 'react';
import type { ToolCategory } from '@shared/contract';
import { EmptyState, Select, type SelectGroup, type SelectItem } from '@/ui';
import { ToolRunner } from './ToolRunner';
import { useTools } from './useTools';

/**
 * The frame the encoding and the encryption playground share: pick a tool, fill in the form main
 * declared for it, read the result. A picker rather than a sidebar, so the panel survives a narrow
 * cell.
 */
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
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
                <Select label="Tool" size="sm" value={selected.id} items={groups} onValueChange={setToolId} className="max-w-72"/>
                <span className="mono ml-auto text-xs text-text-faint">{selected.id}</span>
            </header>
            <div className="min-h-0 grow overflow-auto p-4">
                <ToolRunner tool={selected} deviceId={deviceId}/>
            </div>
        </div>
    );
}
