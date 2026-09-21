import type { ReactNode } from 'react';
import clsx from 'clsx';

type KeyValueProps = {
    readonly label: string;
    readonly children: ReactNode;
    readonly mono?: boolean;
    readonly className?: string;
};

export function KeyValue({label, children, mono = true, className}: KeyValueProps) {
    return (
        <div className={clsx('flex items-baseline gap-3 py-0.5', className)}>
            <span className="w-36 shrink-0 truncate text-xs text-text-muted">{label}</span>
            <span className={clsx('min-w-0 grow break-all text-text', mono ? 'mono' : 'text-xs')}>{children}</span>
        </div>
    );
}

export function KeyValueList({className, children}: { readonly className?: string; readonly children: ReactNode }) {
    return <div className={clsx('flex flex-col divide-y divide-border-soft', className)}>{children}</div>;
}
