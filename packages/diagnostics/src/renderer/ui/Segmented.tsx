import type { ReactNode } from 'react';
import clsx from 'clsx';

export type SegmentedItem<T extends string> = {
    readonly value: T;
    readonly label: string;
    readonly icon?: ReactNode;
};

type SegmentedProps<T extends string> = {
    readonly value: T;
    readonly onValueChange: (value: T) => void;
    readonly items: readonly SegmentedItem<T>[];
    readonly label: string;
    readonly size?: 'sm' | 'md';
    readonly className?: string;
};

export function Segmented<T extends string>({value, onValueChange, items, label, size = 'sm', className}: SegmentedProps<T>) {
    return (
        <div role="radiogroup" aria-label={label} className={clsx('inline-flex w-fit shrink-0 items-center gap-px self-start rounded-lg bg-surface-sunken p-px', className)}>
            {items.map(item => (
                <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={item.value === value}
                    aria-label={item.label}
                    onClick={() => onValueChange(item.value)}
                    className={clsx(
                        'inline-flex shrink-0 cursor-default items-center justify-center gap-1 rounded-[7px] px-2 text-xs',
                        size === 'sm' ? 'h-6' : 'h-7',
                        item.value === value ? 'bg-surface-raised text-text shadow-float' : 'text-text-muted hover:text-text'
                    )}
                >
                    {item.icon}
                    {item.icon === undefined && item.label}
                </button>
            ))}
        </div>
    );
}
