import type { ReactNode } from 'react';
import clsx from 'clsx';

type EmptyStateProps = {
    readonly icon?: ReactNode;
    /* One sentence. What is missing, and what puts something there. */
    readonly children: ReactNode;
    /* The button or the shortcut that fills the space; kept to one. */
    readonly action?: ReactNode;
    readonly className?: string;
};

export function EmptyState({icon, children, action, className}: EmptyStateProps) {
    return (
        <div className={clsx('flex flex-col items-center justify-center gap-2 px-6 py-8 text-center', className)}>
            {icon && <span className="text-text-faint">{icon}</span>}
            <p className="max-w-[280px] text-xs leading-snug text-text-muted">{children}</p>
            {/* The button is an answer to the sentence, not a third line of it. */}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}
