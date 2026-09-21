import { useState, type ReactElement } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { isBytes } from '@shared/helpers';
import { Icon } from './Icon';

/** Rows past this are folded away behind a count; a playback queue is thousands of items long. */
const PREVIEW = 100;

type JsonViewProps = {
    readonly value: unknown;
    /* How many levels start open. Two shows a message and its first field. */
    readonly defaultDepth?: number;
    readonly className?: string;
};

/* Renders serialized payloads, including `{ $bytes }` hex values. */
export function JsonView({value, defaultDepth = 2, className}: JsonViewProps) {
    return (
        <div className={clsx('mono text-code-fg', className)}>
            <Node name={null} value={value} depth={0} defaultDepth={defaultDepth}/>
        </div>
    );
}

function Node({name, value, depth, defaultDepth}: { readonly name: string | null; readonly value: unknown; readonly depth: number; readonly defaultDepth: number }) {
    const [open, setOpen] = useState(depth < defaultDepth);
    const entries = childrenOf(value);

    if (entries === null) {
        return (
            <div className="flex gap-1.5" style={{paddingLeft: depth * 12}}>
                {name !== null && <span className="text-code-key">{name}:</span>}
                <Leaf value={value}/>
            </div>
        );
    }

    const shown = entries.slice(0, PREVIEW);

    return (
        <div style={{paddingLeft: depth * 12}}>
            <button type="button" className="flex cursor-default items-center gap-1 hover:text-text" onClick={() => setOpen(!open)}>
                <Icon icon={open ? ChevronDown : ChevronRight} size={12} className="text-code-dim"/>
                {name !== null && <span className="text-code-key">{name}:</span>}
                <span className="text-code-dim">{summaryOf(value, entries.length)}</span>
            </button>
            {open && (
                <div>
                    {shown.map(([key, entry]) => (
                        <Node key={key} name={key} value={entry} depth={depth + 1} defaultDepth={defaultDepth}/>
                    ))}
                    {entries.length > shown.length && (
                        <div className="text-code-dim" style={{paddingLeft: (depth + 1) * 12}}>
                            {entries.length - shown.length} more
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Leaf({value}: { readonly value: unknown }): ReactElement {
    if (isBytes(value)) {
        return (
            <span className="text-code-number">
                {value.length} bytes <span className="text-code-dim">{hexPreview(value.$bytes)}</span>
            </span>
        );
    }

    if (value === null || value === undefined) {
        return <span className="text-code-null">null</span>;
    }

    if (typeof value === 'string') {
        return <span className="text-code-string">&quot;{value}&quot;</span>;
    }

    if (typeof value === 'number') {
        return <span className="text-code-number">{value}</span>;
    }

    if (typeof value === 'boolean') {
        return <span className="text-code-bool">{String(value)}</span>;
    }

    return <span>{String(value)}</span>;
}

function childrenOf(value: unknown): [string, unknown][] | null {
    if (value === null || typeof value !== 'object' || isBytes(value)) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((entry, index) => [String(index), entry]);
    }

    return Object.entries(value as Record<string, unknown>);
}

function summaryOf(value: unknown, count: number): string {
    if (Array.isArray(value)) {
        return `[${count}]`;
    }

    const typeName = (value as { $typeName?: string }).$typeName;

    return typeName ? `${typeName} {${count}}` : `{${count}}`;
}

function hexPreview(hex: string): string {
    const head = hex.slice(0, 32);
    const grouped = head.match(/.{1,2}/g)?.join(' ') ?? '';
    return hex.length > 32 ? `${grouped} ...` : grouped;
}
