import type { ReactNode } from 'react';
import clsx from 'clsx';
import { TOOLTIP_KBD } from './classes';

const APPLE = navigator.platform.startsWith('Mac') || navigator.userAgent.includes('Mac OS');

/* `Mod` is whichever key this platform uses for an application shortcut. */
export function shortcut(keys: string): string {
    return APPLE ? keys.replace('Mod', '⌘').replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '') : keys.replace('Mod', 'Ctrl');
}

/* One shortcut, drawn as a cap. `variant="menu"` leaves the dressing to the `.menu-item kbd` rule. */
export function Kbd({children, variant = 'inline', className}: { readonly children: ReactNode; readonly variant?: 'menu' | 'inline'; readonly className?: string }) {
    return <kbd className={clsx(variant === 'inline' && TOOLTIP_KBD, className)}>{typeof children === 'string' ? shortcut(children) : children}</kbd>;
}
