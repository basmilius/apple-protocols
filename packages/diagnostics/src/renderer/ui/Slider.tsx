import { Slider as BaseSlider } from '@base-ui-components/react/slider';
import clsx from 'clsx';

type SliderProps = {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
    /* Fired once, when the drag ends. A device that is set on every frame would be flooded. */
    readonly onValueCommitted?: (value: number) => void;
    readonly label: string;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly disabled?: boolean;
    readonly className?: string;
};

/* One value along a track: a volume, a position, a fade. */
export function Slider({value, onValueChange, onValueCommitted, label, min = 0, max = 100, step = 1, disabled, className}: SliderProps) {
    return (
        <BaseSlider.Root
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={next => onValueChange(Array.isArray(next) ? next[0] : next)}
            onValueCommitted={next => onValueCommitted?.(Array.isArray(next) ? next[0] : next)}
            className={clsx('w-full', disabled && 'opacity-50', className)}
        >
            <BaseSlider.Control className="flex h-5 w-full items-center">
                <BaseSlider.Track className="h-1 w-full rounded-full bg-surface-active">
                    <BaseSlider.Indicator className="h-full rounded-full bg-accent"/>
                    <BaseSlider.Thumb aria-label={label} className="h-3.5 w-3.5 rounded-full border border-border bg-surface-raised shadow-float outline-none focus-visible:outline-2 focus-visible:outline-accent"/>
                </BaseSlider.Track>
            </BaseSlider.Control>
        </BaseSlider.Root>
    );
}
