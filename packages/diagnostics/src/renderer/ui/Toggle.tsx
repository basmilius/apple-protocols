import { Switch } from '@base-ui-components/react/switch';
import clsx from 'clsx';

type ToggleProps = {
    readonly checked: boolean;
    readonly onCheckedChange: (checked: boolean) => void;
    readonly label: string;
    readonly disabled?: boolean;
    readonly className?: string;
};

export function Toggle({checked, onCheckedChange, label, disabled, className}: ToggleProps) {
    return (
        <Switch.Root
            aria-label={label}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
            className={clsx(
                'relative h-5 w-9 shrink-0 cursor-default rounded-full border border-border bg-surface-sunken transition-colors data-[checked]:border-transparent data-[checked]:bg-accent disabled:opacity-50',
                className
            )}
        >
            <Switch.Thumb className="block h-4 w-4 translate-x-px rounded-full bg-surface-raised shadow-float transition-transform data-[checked]:translate-x-[17px]"/>
        </Switch.Root>
    );
}
