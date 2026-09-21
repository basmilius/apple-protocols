import { useEffect, useRef, useState } from 'react';

/** The window the sparkline draws, at four samples a second roughly fifteen seconds of history. */
const HISTORY = 60;

type SparklineProps = {
    readonly label: string;
    readonly value: number;
    readonly format?: (value: number) => string;
};

/** History belongs to the mounted sparkline and resets on remount. */
export function Sparkline({label, value, format}: SparklineProps) {
    const [history, setHistory] = useState<readonly number[]>([]);
    const latest = useRef(value);

    latest.current = value;

    useEffect(() => {
        setHistory(previous => {
            const next = [...previous, latest.current];
            return next.length > HISTORY ? next.slice(next.length - HISTORY) : next;
        });
    }, [value]);

    const max = Math.max(1, ...history);
    const points = history.map((entry, index) => `${(index / Math.max(1, HISTORY - 1)) * 100},${24 - (entry / max) * 22}`).join(' ');

    return (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken p-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-text-faint">{label}</span>
                <span className="mono text-xs tabular-nums text-text">{format ? format(value) : value}</span>
            </div>
            <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full">
                {history.length > 1 && <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-accent"/>}
            </svg>
        </div>
    );
}

export function StatGrid({entries}: { readonly entries: readonly [string, string][] }) {
    return (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {entries.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-surface-sunken px-2 py-1.5">
                    <div className="text-xs text-text-faint">{label}</div>
                    <div className="mono truncate text-xs tabular-nums text-text">{value}</div>
                </div>
            ))}
        </div>
    );
}
