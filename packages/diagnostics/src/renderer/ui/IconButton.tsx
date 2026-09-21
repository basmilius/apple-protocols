import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly icon: LucideIcon;
    /* The accessible name, and the tooltip unless `tooltip` is false. */
    readonly label: string;
    readonly tooltip?: boolean;
    readonly size?: 'sm' | 'md';
    readonly active?: boolean;
    readonly iconSize?: number;
};

/* The square button the toolbars, the sidebar footer and every cell bar are built out of. */
export function IconButton({icon, label, tooltip = true, size = 'md', active, iconSize, className, ...rest}: IconButtonProps) {
    const button = (
        <button
            type="button"
            aria-label={label}
            data-active={active === undefined ? undefined : String(active)}
            className={clsx('icon-btn cursor-default', size === 'sm' && 'h-7 w-7', className)}
            {...rest}
        >
            <Icon icon={icon} size={iconSize ?? (size === 'sm' ? 14 : 16)}/>
        </button>
    );

    return tooltip ? <Tooltip label={label}>{button}</Tooltip> : button;
}
