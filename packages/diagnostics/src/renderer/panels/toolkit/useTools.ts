import { useEffect, useMemo, useState } from 'react';
import type { ToolCategory, ToolInfo } from '@shared/contract';
import { invoke, messageOf } from '@/client';

/** Cached for the lifetime of the window, because main never changes the list while it runs. */
let cache: readonly ToolInfo[] | null = null;
let pending: Promise<readonly ToolInfo[]> | null = null;

const load = (): Promise<readonly ToolInfo[]> => {
    if (cache !== null) {
        return Promise.resolve(cache);
    }

    pending ??= invoke('tool:list', undefined).then(tools => {
        cache = tools;
        return tools;
    });

    return pending;
};

export type ToolsHandle = {
    readonly tools: readonly ToolInfo[];
    readonly loading: boolean;
    readonly error: string | null;
};

export function useTools(category: ToolCategory): ToolsHandle {
    const [all, setAll] = useState<readonly ToolInfo[]>(cache ?? []);
    const [loading, setLoading] = useState(cache === null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        load().then(
            tools => {
                if (alive) {
                    setAll(tools);
                    setLoading(false);
                }
            },
            failure => {
                if (alive) {
                    setError(messageOf(failure, 'The tool list could not be read.'));
                    setLoading(false);
                }
            }
        );

        return () => {
            alive = false;
        };
    }, []);

    const tools = useMemo(() => all.filter(tool => tool.category === category), [all, category]);

    return {tools, loading, error};
}
