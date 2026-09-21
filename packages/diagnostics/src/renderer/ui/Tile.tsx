import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type TileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
    readonly icon: ReactNode;
    readonly title: string;
    readonly description?: ReactNode;
    readonly primary?: boolean;
    readonly size?: 'md' | 'sm';
};

export function Tile({icon, title, description, primary = false, size = 'md', className, type = 'button', ...rest}: TileProps) {
    return (
        <button
            type={type}
            className={clsx(
                'flex min-w-0 cursor-default items-center border bg-surface text-left hover:bg-surface-hover disabled:opacity-50 disabled:hover:bg-surface',
                size === 'md' ? 'gap-3 rounded-xl p-3' : 'gap-2 rounded-lg px-2 py-1.5',
                primary ? 'border-accent' : 'border-border',
                className
            )}
            {...rest}
        >
            <span className={clsx('grid shrink-0 place-items-center rounded-lg', size === 'md' ? 'size-8' : 'size-6', primary ? 'bg-accent text-accent-text' : 'bg-surface-sunken text-text-muted')}>
                {icon}
            </span>
            <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-sm font-medium text-text">{title}</span>
                {description && <span className="truncate text-2xs text-text-muted">{description}</span>}
            </span>
        </button>
    );
}
