import type { ReactNode } from 'react';
import clsx from 'clsx';

type KeyValueProps = {
    readonly label: string;
    readonly children: ReactNode;
    /* Off for a value that is prose rather than an identifier. */
    readonly mono?: boolean;
    readonly className?: string;
};

/* One dense label/value row. The label column is fixed, so a list of them reads as a table. */
export function KeyValue({label, children, mono = true, className}: KeyValueProps) {
    return (
        <div className={clsx('flex items-baseline gap-3 py-0.5', className)}>
            <span className="w-36 shrink-0 truncate text-xs text-text-muted">{label}</span>
            <span className={clsx('min-w-0 grow break-all text-text', mono ? 'mono' : 'text-xs')}>{children}</span>
        </div>
    );
}

/* A run of rows, with the hairlines between them. */
export function KeyValueList({className, children}: { readonly className?: string; readonly children: ReactNode }) {
    return <div className={clsx('flex flex-col divide-y divide-border-soft', className)}>{children}</div>;
}
