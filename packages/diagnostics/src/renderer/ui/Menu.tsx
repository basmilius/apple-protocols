import type { ReactElement, ReactNode } from 'react';
import { ContextMenu as DesktopContextMenu, Menu as DesktopMenu } from '@adecore/ui';

type PopupProps = {
    readonly side?: 'top' | 'bottom' | 'left' | 'right';
    readonly align?: 'start' | 'center' | 'end';
    readonly sideOffset?: number;
    readonly className?: string;
    readonly children: ReactNode;
};

export function Menu({trigger, ...popup}: PopupProps & { readonly trigger: ReactElement<Record<string, unknown>> }) {
    return (
        <DesktopMenu.Root>
            <DesktopMenu.Trigger render={trigger}/>
            <DesktopMenu.Popup {...popup}/>
        </DesktopMenu.Root>
    );
}

export function ContextMenu({trigger, children, className}: { readonly trigger: ReactElement<Record<string, unknown>>; readonly children: ReactNode; readonly className?: string }) {
    return (
        <DesktopContextMenu.Root>
            <DesktopContextMenu.Trigger render={trigger}/>
            <DesktopContextMenu.Popup className={className}>{children}</DesktopContextMenu.Popup>
        </DesktopContextMenu.Root>
    );
}

export const MenuItem = DesktopMenu.Item;
export const ContextMenuItem = DesktopContextMenu.Item;
export const MenuSeparator = DesktopMenu.Separator;
