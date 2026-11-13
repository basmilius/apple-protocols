import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { Icon, IconButton, SectionLabel } from '@adecore/ui';

type SectionProps = {
    readonly title: string;
    readonly icon?: LucideIcon;
    readonly actions?: ReactNode;
    /* Read by `PanelBody`: spans both masonry columns, for tables, feeds, charts and other content that needs the width. */
    readonly wide?: boolean;
    /* Folds the body away behind its header, for expert controls a page does not need at first sight. */
    readonly collapsible?: boolean;
    readonly defaultOpen?: boolean;
    readonly className?: string;
    readonly children: ReactNode;
};

/**
 * A card with its header in the top left corner.
 *
 * The header line is as tall as the 16 pixel icon, so the icon stands as far from the top edge as from the left one. Actions
 * are taller than that line; a negative margin lets them hang over it without pushing the title down.
 */
export function Section({title, icon, actions, collapsible = false, defaultOpen = true, className, children}: SectionProps) {
    const [open, setOpen] = useState(!collapsible || defaultOpen);

    return (
        <section className={clsx('flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-3 @[520px]:p-4', className)}>
            <header className="flex h-4 min-w-0 shrink-0 items-center gap-2 leading-4">
                {icon && <Icon icon={icon} size={16} className="shrink-0 text-text-muted"/>}
                <SectionLabel render={<h2/>} className="min-w-0 truncate text-text-muted">
                    {title}
                </SectionLabel>
                {((actions && open) || collapsible) && (
                    <span className="-my-1.5 ml-auto flex shrink-0 items-center gap-1">
                        {open && actions}
                        {collapsible && <IconButton icon={open ? ChevronDown : ChevronRight} label={open ? `Collapse ${title}` : `Expand ${title}`} size="sm" aria-expanded={open} onClick={() => setOpen(!open)}/>}
                    </span>
                )}
            </header>
            {open && children}
        </section>
    );
}
