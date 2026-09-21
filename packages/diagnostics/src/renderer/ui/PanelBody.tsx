import type { ReactNode } from 'react';
import clsx from 'clsx';

type PanelBodyProps = {
    readonly children: ReactNode;
    readonly className?: string;
};

/* Use cell width for responsive columns. Non-Section children and wide sections span both columns. */
export function PanelBody({children, className}: PanelBodyProps) {
    return (
        <div className="@container h-full overflow-auto">
            <div className={clsx('grid grid-cols-1 items-start gap-x-6 gap-y-5 p-4 @[840px]:grid-cols-2 [&>:not(section)]:col-span-full', className)}>{children}</div>
        </div>
    );
}
