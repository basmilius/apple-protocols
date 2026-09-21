import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'positive';
type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
    // A filled button darkens under the pointer. Its color is the meaning, so no token of its own for hover.
    primary: 'bg-accent text-accent-text hover:brightness-90 disabled:hover:brightness-100',
    secondary: 'border border-border bg-surface-raised text-text hover:bg-surface-hover disabled:hover:bg-surface-raised',
    ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
    danger: 'bg-status-error text-accent-text hover:brightness-90 disabled:hover:brightness-100',
    positive: 'bg-positive text-positive-text hover:brightness-90 disabled:hover:brightness-100'
};

/* 28 and 32 pixels, the two heights the rest of the app already uses for a compact and a normal control. */
const SIZE: Record<ButtonSize, string> = {
    sm: 'h-7 px-2.5',
    md: 'h-8 px-3'
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly variant?: ButtonVariant;
    readonly size?: ButtonSize;
};

/* Every button with a word in it. Icon-only buttons stay `IconButton`, which is a square, not a label. */
export function Button({variant = 'ghost', size = 'md', className, type = 'button', ...rest}: ButtonProps) {
    return (
        <button
            type={type}
            className={clsx(
                'inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 rounded-md text-xs font-medium disabled:opacity-50',
                VARIANT[variant],
                SIZE[size],
                className
            )}
            {...rest}
        />
    );
}
