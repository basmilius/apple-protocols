import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { Icon, SectionLabel } from '@adecore/ui';

type SectionProps = {
    readonly title: string;
    readonly icon?: LucideIcon;
    readonly actions?: ReactNode;
    /* Keeps the whole row in a `PanelBody` that would otherwise pair this block with a neighbor. */
    readonly wide?: boolean;
    /* Folds the body away behind its header, for expert controls a page does not need at first sight. */
    readonly collapsible?: boolean;
    readonly defaultOpen?: boolean;
    readonly className?: string;
    readonly children: ReactNode;
};

export function Section({title, icon, actions, wide = false, collapsible = false, defaultOpen = true, className, children}: SectionProps) {
    const [open, setOpen] = useState(!collapsible || defaultOpen);

    const label = (
        <span className="flex min-w-0 items-center gap-1.5 text-text-faint">
            {collapsible && <Icon icon={open ? ChevronDown : ChevronRight} size={12}/>}
            {icon && <Icon icon={icon} size={13}/>}
            <SectionLabel render={<h2/>} className="truncate">{title}</SectionLabel>
        </span>
    );

    return (
        <section className={clsx('flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface-raised p-3 @[520px]:p-4', wide && 'col-span-full', className)}>
            <header className="flex min-h-7 shrink-0 flex-wrap items-center gap-2">
                {collapsible ? (
                    <button type="button" aria-expanded={open} className="flex min-w-0 cursor-default items-center hover:text-text" onClick={() => setOpen(!open)}>
                        {label}
                    </button>
                ) : (
                    label
                )}
                {actions && open && <span className="ml-auto flex items-center gap-1">{actions}</span>}
            </header>
            {open && children}
        </section>
    );
}
