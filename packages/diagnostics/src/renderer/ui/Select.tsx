import type { ReactNode } from 'react';
import { Select as BaseSelect } from '@base-ui-components/react/select';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { MENU_LABEL } from './classes';
import { Icon } from './Icon';

export type SelectItem<T extends string> = {
    readonly value: T;
    readonly label: string;
    /* A second line under the label, for what the choice does. */
    readonly description?: string;
    readonly icon?: ReactNode;
    readonly disabled?: boolean;
};

export type SelectGroup<T extends string> = {
    readonly label: string;
    readonly items: readonly SelectItem<T>[];
};

type SelectProps<T extends string> = {
    readonly value: T | null;
    readonly onValueChange: (value: T) => void;
    readonly items: readonly SelectItem<T>[] | readonly SelectGroup<T>[];
    /* The accessible name of the trigger; the row above it usually carries the visible one. */
    readonly label: string;
    readonly placeholder?: string;
    readonly size?: 'sm' | 'md';
    readonly variant?: 'outlined' | 'ghost';
    readonly disabled?: boolean;
    readonly align?: 'start' | 'end';
    readonly className?: string;
};

const isGroup = <T extends string>(entry: SelectItem<T> | SelectGroup<T>): entry is SelectGroup<T> => Array.isArray((entry as SelectGroup<T>).items);

const TRIGGER_SIZE = {
    sm: 'h-7 gap-1 px-2',
    md: 'h-8 gap-1.5 px-2'
} as const;

const TRIGGER_VARIANT = {
    outlined: 'max-w-56 rounded-lg border border-border bg-surface-raised text-text focus-visible:ring-1 focus-visible:ring-accent',
    ghost: 'rounded-md text-text-muted hover:bg-surface-hover hover:text-text data-[popup-open]:bg-surface-active data-[popup-open]:text-text data-disabled:hover:bg-transparent data-disabled:hover:text-text-muted'
} as const;

/* The dimmed look a disabled button wears, so a select that cannot open reads as such. */
const TRIGGER_DISABLED = 'data-disabled:cursor-default data-disabled:opacity-50';

/* A description makes the row two lines high; the check and the icon then belong on the label's
   line box, which the 20 pixel boxes around them give them. */
function Row<T extends string>({item}: { readonly item: SelectItem<T> }) {
    return (
        <BaseSelect.Item className={clsx('menu-item', item.description && 'items-start')} value={item.value} disabled={item.disabled}>
            <span className="grid h-5 w-4 shrink-0 place-items-center">
                <BaseSelect.ItemIndicator>
                    <Icon icon={Check} size={14}/>
                </BaseSelect.ItemIndicator>
            </span>
            {item.icon && <span className="flex h-5 shrink-0 items-center">{item.icon}</span>}
            <span className="flex min-w-0 flex-col">
                <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                {item.description && <span className="text-xs text-text-faint">{item.description}</span>}
            </span>
        </BaseSelect.Item>
    );
}

/* The one select in the app, in the popup style the menus use. Base UI brings the keyboard along
   (arrows, Home and End, typeahead, Enter, Escape), which a hand-rolled listbox would have to repeat. */
export function Select<T extends string>({
    value,
    onValueChange,
    items,
    label,
    placeholder = 'Select',
    size = 'md',
    variant = 'outlined',
    disabled,
    align = 'start',
    className
}: SelectProps<T>) {
    const groups = items.length > 0 && isGroup(items[0]!) ? (items as readonly SelectGroup<T>[]) : null;
    const flat = groups ? groups.flatMap(group => group.items) : (items as readonly SelectItem<T>[]);
    const selected = flat.find(item => item.value === value) ?? null;

    return (
        <BaseSelect.Root value={value} disabled={disabled} onValueChange={next => onValueChange(next as T)}>
            <BaseSelect.Trigger
                aria-label={label}
                className={clsx(
                    'flex shrink-0 cursor-default items-center whitespace-nowrap text-xs outline-none',
                    TRIGGER_SIZE[size],
                    TRIGGER_VARIANT[variant],
                    TRIGGER_DISABLED,
                    className
                )}
            >
                {selected?.icon}
                <BaseSelect.Value className="truncate">{selected?.label ?? placeholder}</BaseSelect.Value>
                <BaseSelect.Icon className="ml-auto flex shrink-0 pl-1">
                    <Icon icon={ChevronDown} size={14}/>
                </BaseSelect.Icon>
            </BaseSelect.Trigger>
            <BaseSelect.Portal>
                <BaseSelect.Positioner className="z-(--z-popup)" side="bottom" align={align} sideOffset={6} alignItemWithTrigger={false}>
                    <BaseSelect.Popup className="menu-popup">
                        <BaseSelect.List className="max-h-80 overflow-auto">
                            {groups
                                ? groups.map(group => (
                                      <BaseSelect.Group key={group.label}>
                                          <BaseSelect.GroupLabel className={MENU_LABEL}>{group.label}</BaseSelect.GroupLabel>
                                          {group.items.map(item => (
                                              <Row key={item.value} item={item}/>
                                          ))}
                                      </BaseSelect.Group>
                                  ))
                                : flat.map(item => <Row key={item.value} item={item}/>)}
                        </BaseSelect.List>
                    </BaseSelect.Popup>
                </BaseSelect.Positioner>
            </BaseSelect.Portal>
        </BaseSelect.Root>
    );
}
