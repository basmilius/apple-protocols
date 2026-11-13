import type { ReactNode } from 'react';

type MasterDetailProps = {
    readonly toolbar: ReactNode;
    readonly list: ReactNode;
    readonly detail: ReactNode;
};

/** A full-height page of rows on the left and the picked row on the right, under one toolbar. */
export function MasterDetail({toolbar, list, detail}: MasterDetailProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">{toolbar}</header>
            <div className="flex min-h-0 grow">
                <div className="min-h-0 w-1/2 shrink-0 overflow-auto border-r border-border">{list}</div>
                <div className="flex min-h-0 min-w-0 grow flex-col">{detail}</div>
            </div>
        </div>
    );
}

/** The right side of a {@link MasterDetail}: a title line with actions over a scrolling code ground. */
export function DetailPane({title, actions, children}: { readonly title?: ReactNode; readonly actions?: ReactNode; readonly children: ReactNode }) {
    return (
        <>
            {(title || actions) && (
                <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
                    <span className="min-w-0 grow truncate text-text">{title}</span>
                    {actions}
                </div>
            )}
            <div className="min-h-0 grow overflow-auto bg-code-bg p-3">{children}</div>
        </>
    );
}
