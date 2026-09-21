import type { ReactNode } from 'react';
import clsx from 'clsx';

type PanelBodyProps = {
    readonly children: ReactNode;
    readonly className?: string;
};

/*
 * The scrolling body of a panel. A panel lives in a split cell, so it is the cell's width that
 * decides the layout, never the window's: sections sit two abreast once the cell has the room.
 * Anything that is not a `Section`, and a `Section` marked `wide`, keeps the full width.
 */
export function PanelBody({children, className}: PanelBodyProps) {
    return (
        <div className="@container h-full overflow-auto">
            <div className={clsx('grid grid-cols-1 items-start gap-x-6 gap-y-5 p-4 @[840px]:grid-cols-2 [&>:not(section)]:col-span-full', className)}>{children}</div>
        </div>
    );
}
