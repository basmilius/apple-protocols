import type { ReactNode } from 'react';
import { CircleCheck, CircleDashed, CircleX, type LucideIcon, TriangleAlert } from 'lucide-react';
import { Icon, Pill, Spinner } from '@adecore/ui';

export type Status = 'ok' | 'busy' | 'warning' | 'error' | 'off' | 'accent';

const TONES = {
    ok: 'idle',
    busy: 'accent',
    warning: 'needsYou',
    error: 'error',
    off: 'muted',
    accent: 'accent'
} as const;

const ICONS: Record<Status, LucideIcon | null> = {
    ok: CircleCheck,
    busy: null,
    warning: TriangleAlert,
    error: CircleX,
    off: CircleDashed,
    accent: null
};

type StatusPillProps = {
    readonly status: Status;
    /* Replaces the glyph the status brings, such as a protocol icon in front of its state. */
    readonly icon?: LucideIcon;
    readonly mono?: boolean;
    readonly children: ReactNode;
};

export function StatusPill({status, icon, mono, children}: StatusPillProps) {
    const glyph = icon ?? ICONS[status];

    return (
        <Pill tone={TONES[status]} mono={mono} icon={status === 'busy' && icon === undefined ? <Spinner size={12}/> : glyph && <Icon icon={glyph} size={12}/>}>
            {children}
        </Pill>
    );
}

/** A count or a plain fact in a section header. */
export function CountPill({children}: { readonly children: ReactNode }) {
    return (
        <Pill tone="muted" mono>
            {children}
        </Pill>
    );
}

export function BoolValue({value, yes = 'yes', no = 'no'}: { readonly value: boolean | null | undefined; readonly yes?: string; readonly no?: string }) {
    if (value === null || value === undefined) {
        return <span className="text-text-faint">-</span>;
    }

    return (
        <span className={value ? 'inline-flex items-center gap-1 text-status-idle' : 'inline-flex items-center gap-1 text-text-muted'}>
            <Icon icon={value ? CircleCheck : CircleX} size={12}/>
            {value ? yes : no}
        </span>
    );
}

/** The line over a page: what state the thing is in, with a banner above it when something waits. */
export function StatusBar({banner, children}: { readonly banner?: ReactNode; readonly children?: ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            {banner}
            {children && <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-faint">{children}</div>}
        </div>
    );
}
