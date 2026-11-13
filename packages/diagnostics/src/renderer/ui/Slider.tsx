import { Slider as BaseSlider } from '@base-ui/react/slider';
import clsx from 'clsx';

type SliderProps = {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
    /* Fires on release to avoid sending device commands on every pointer move. */
    readonly onValueCommitted?: (value: number) => void;
    readonly label: string;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly disabled?: boolean;
    readonly className?: string;
};

const placesOf = (value: number): number => (String(value).split('.')[1] ?? '').length;

const first = (next: number | readonly number[]): number => (Array.isArray(next) ? next[0] : (next as number));

/* The ADE CORE slider looks the same but has no `onValueCommitted`, and a device command belongs on release, not on every move. */
export function Slider({value, onValueChange, onValueCommitted, label, min = 0, max = 100, step = 1, disabled, className}: SliderProps) {
    // Base UI adds steps in floating point, so 0.2 plus 0.1 would arrive as 0.30000000000000004.
    const places = Math.max(placesOf(step), placesOf(min));
    // Base UI's Page Up jumps 10 whatever the range; a tenth of the range suits 0 to 1 as well as 0 to 1000.
    const largeStep = Math.max(step, Math.round((max - min) / 10 / step) * step);

    return (
        <BaseSlider.Root
            value={value}
            min={min}
            max={max}
            step={step}
            largeStep={largeStep}
            disabled={disabled}
            onValueChange={next => onValueChange(Number(first(next).toFixed(places)))}
            onValueCommitted={next => onValueCommitted?.(Number(first(next).toFixed(places)))}
            className={clsx('w-full data-disabled:opacity-50', className)}
        >
            {/* The padding gives the thumb room at either end; Base UI leaves it out of the pointer's position. */}
            <BaseSlider.Control className="flex h-5 touch-none items-center px-2 select-none">
                <BaseSlider.Track className="relative h-1 w-full rounded-full bg-border-strong">
                    <BaseSlider.Indicator className="rounded-full bg-accent"/>
                    <BaseSlider.Thumb aria-label={label} className="block size-4 rounded-full bg-thumb shadow-thumb outline-offset-2 outline-accent-on-surface has-focus-visible:outline-2"/>
                </BaseSlider.Track>
            </BaseSlider.Control>
        </BaseSlider.Root>
    );
}
