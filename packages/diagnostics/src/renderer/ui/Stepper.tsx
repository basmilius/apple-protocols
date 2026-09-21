import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

type StepperProps = {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
    readonly label: string;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly format?: (value: number) => string;
    readonly disabled?: boolean;
};

/* A number moved one step at a time, with the value between the two keys. */
export function Stepper({value, onValueChange, label, min = 0, max = 100, step = 1, format, disabled}: StepperProps) {
    const clamp = (next: number): number => Math.min(max, Math.max(min, next));

    return (
        <div className="inline-flex items-center gap-px rounded-lg bg-surface-sunken p-px" role="group" aria-label={label}>
            <IconButton icon={Minus} label={`${label} down`} size="sm" disabled={disabled || value <= min} onClick={() => onValueChange(clamp(value - step))}/>
            <span className="min-w-10 text-center text-xs tabular-nums text-text">{format ? format(value) : value}</span>
            <IconButton icon={Plus} label={`${label} up`} size="sm" disabled={disabled || value >= max} onClick={() => onValueChange(clamp(value + step))}/>
        </div>
    );
}
