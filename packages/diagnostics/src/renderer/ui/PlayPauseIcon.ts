import { createLucideIcon } from 'lucide-react';

/** The play or pause toggle: a play triangle and two pause bars in one glyph. Lucide ships no combined icon. */
export const PlayPauseIcon = createLucideIcon('play-pause', [
    ['path', {d: 'M3 6.5v11a1 1 0 0 0 1.5.86l8-5.5a1 1 0 0 0 0-1.72l-8-5.5A1 1 0 0 0 3 6.5z', key: 'play'}],
    ['path', {d: 'M16 6v12', key: 'bar-left'}],
    ['path', {d: 'M21 6v12', key: 'bar-right'}]
]);
