import type { ReactNode } from 'react';
import clsx from 'clsx';
import { SECTION_LABEL } from './classes';

type SectionProps = {
    readonly title: string;
    readonly actions?: ReactNode;
    /* Keeps the whole row in a `PanelBody` that would otherwise pair this block with a neighbor. */
    readonly wide?: boolean;
    readonly className?: string;
    readonly children: ReactNode;
};

export function Section({title, actions, wide = false, className, children}: SectionProps) {
    return (
        <section className={clsx('flex min-w-0 flex-col gap-2', wide && 'col-span-full', className)}>
            <header className="flex h-6 shrink-0 items-center gap-2">
                <h2 className={clsx(SECTION_LABEL, 'uppercase tracking-wide')}>{title}</h2>
                {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
            </header>
            {children}
        </section>
    );
}
