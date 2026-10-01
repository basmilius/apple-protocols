import type { ReactNode } from 'react';
import { formatShortcut, isApplePlatform, Kbd as DesktopKbd, shortcut as parseShortcut } from '@basmilius/desktop-ui';

export function shortcut(keys: string): string {
    return formatShortcut(parseShortcut(keys), isApplePlatform());
}

export function Kbd({children, variant = 'inline', className}: { readonly children: ReactNode; readonly variant?: 'menu' | 'inline'; readonly className?: string }) {
    return <DesktopKbd variant={variant} className={className}>{typeof children === 'string' && children.includes('Mod+') ? shortcut(children) : children}</DesktopKbd>;
}
