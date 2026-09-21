import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

/* Use a lighter stroke at small sizes to match adjacent text. */
const STROKE_WIDTH = 1.75;

type IconProps = {
    readonly icon: LucideIcon;
    readonly size?: number;
    readonly className?: string;
};

/* Decorative icons stay hidden from screen readers; the containing control supplies the accessible name. */
export function Icon({icon: Glyph, size = 16, className}: IconProps) {
    return <Glyph size={size} strokeWidth={STROKE_WIDTH} className={clsx('align-middle', className)} aria-hidden/>;
}
