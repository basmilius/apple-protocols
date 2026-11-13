import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '@adecore/ui';

/*
 * Two columns from 840 pixels in which each card closes up under the one before it. Multi-column has no row gap, so every
 * child carries the bottom margin and the last one drops it. Wide sections and everything that is not a section span both
 * columns, which balances the columns above and below them separately.
 */
const MASONRY = clsx(
    'gap-x-4 @[520px]:gap-x-5 @[840px]:columns-2',
    '[&>*]:mb-4 [&>*]:break-inside-avoid @[520px]:[&>*]:mb-5 [&>*:last-child]:mb-0 [&>:not(section)]:[column-span:all]'
);

type PanelBodyProps = {
    readonly children: ReactNode;
    readonly className?: string;
};

/** The scrolling page of a panel; its cards form a masonry, and a {@link PanelGroup} starts a masonry of its own. */
export function PanelBody({children, className}: PanelBodyProps) {
    return (
        <div className="@container h-full overflow-auto">
            <div className={clsx(MASONRY, 'p-3 @[520px]:p-6', className)}>{children}</div>
        </div>
    );
}

type PanelGroupProps = {
    readonly title?: string;
    readonly icon?: LucideIcon;
    readonly children: ReactNode;
};

/** A block of cards on one subject. It starts below the previous group, so cards of two groups never share a column. */
export function PanelGroup({title, icon, children}: PanelGroupProps) {
    return (
        <div className="panel-group flex flex-col gap-3 [.panel-group+&]:mt-5">
            {title && (
                <h2 className="flex items-center gap-2 text-sm font-medium text-text">
                    {icon && <Icon icon={icon} size={16} className="shrink-0 text-text-muted"/>}
                    {title}
                </h2>
            )}
            <div className={MASONRY}>{children}</div>
        </div>
    );
}
