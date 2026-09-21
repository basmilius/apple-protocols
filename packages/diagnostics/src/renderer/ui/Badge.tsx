import type { ReactNode } from 'react';
import clsx from 'clsx';

/* A status reads from its dot, so the label stays neutral and sits quietly beside other chrome. */
const DOTS = {
    idle: 'bg-status-idle',
    running: 'bg-status-running',
    warning: 'bg-status-needs-you',
    error: 'bg-status-error'
};

const TONES = {
    muted: 'bg-surface-sunken text-text-muted',
    raised: 'bg-surface-active text-text-muted',
    idle: 'border border-border bg-surface-raised text-text-muted',
    running: 'border border-border bg-surface-raised text-text-muted',
    warning: 'border border-border bg-surface-raised text-text-muted',
    error: 'border border-border bg-surface-raised text-status-error',
    accent: 'bg-accent-soft text-accent'
};

type BadgeProps = {
    readonly icon?: ReactNode;
    readonly children: ReactNode;
    readonly tone?: keyof typeof TONES;
    readonly mono?: boolean;
    readonly className?: string;
};

/* The small label in a panel header or a section line: a count, a protocol, a status. */
export function Badge({icon, children, tone = 'muted', mono = false, className}: BadgeProps) {
    return (
        <span className={clsx('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-2xs font-medium', TONES[tone], mono && 'font-mono', className)}>
            {tone in DOTS && <span aria-hidden className={clsx('size-1.5 rounded-full', DOTS[tone as keyof typeof DOTS])}/>}
            {icon}
            {/* `::first-letter` needs a block container, which the flex row around it is not. */}
            <span className={clsx('inline-block', !mono && 'first-letter:uppercase')}>{children}</span>
        </span>
    );
}
