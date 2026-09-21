import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

// The whole app draws at this weight. 2 is Lucide's default, but at 12 and 14 pixels next to text
// of the same size a hair thinner keeps the glyph from outweighing the words beside it.
const STROKE_WIDTH = 1.75;

type IconProps = {
    readonly icon: LucideIcon;
    readonly size?: number;
    readonly className?: string;
};

/* One Lucide icon, sized in pixels. Icons here are decorative. The name a screen reader reads sits
   on the button or the label next to it, so the glyph stays hidden. */
export function Icon({icon: Glyph, size = 16, className}: IconProps) {
    // An inline svg sits on the text baseline, which drops a square glyph below the words next to
    // it; the middle of the box against the middle of the text is what reads as aligned.
    return <Glyph size={size} strokeWidth={STROKE_WIDTH} className={clsx('align-middle', className)} aria-hidden/>;
}
