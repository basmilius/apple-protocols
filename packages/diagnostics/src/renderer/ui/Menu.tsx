import type { ReactElement, ReactNode } from 'react';
import { ContextMenu as BaseContextMenu } from '@base-ui-components/react/context-menu';
import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import clsx from 'clsx';
import { MENU_SEPARATOR } from './classes';

type PopupProps = {
    readonly side?: 'top' | 'bottom' | 'left' | 'right';
    readonly align?: 'start' | 'center' | 'end';
    readonly sideOffset?: number;
    readonly className?: string;
    readonly children: ReactNode;
};

export function Menu({trigger, ...popup}: PopupProps & { readonly trigger: ReactElement<Record<string, unknown>> }) {
    return (
        <BaseMenu.Root>
            <BaseMenu.Trigger render={trigger}/>
            <BaseMenu.Portal>
                <BaseMenu.Positioner className="z-(--z-popup)" side={popup.side ?? 'bottom'} align={popup.align ?? 'start'} sideOffset={popup.sideOffset ?? 6}>
                    <BaseMenu.Popup className={clsx('menu-popup', popup.className)}>{popup.children}</BaseMenu.Popup>
                </BaseMenu.Positioner>
            </BaseMenu.Portal>
        </BaseMenu.Root>
    );
}

export function ContextMenu({trigger, children, className}: { readonly trigger: ReactElement<Record<string, unknown>>; readonly children: ReactNode; readonly className?: string }) {
    return (
        <BaseContextMenu.Root>
            <BaseContextMenu.Trigger render={trigger}/>
            <BaseContextMenu.Portal>
                <BaseContextMenu.Positioner className="z-(--z-popup)">
                    <BaseContextMenu.Popup className={clsx('menu-popup', className)}>{children}</BaseContextMenu.Popup>
                </BaseContextMenu.Positioner>
            </BaseContextMenu.Portal>
        </BaseContextMenu.Root>
    );
}

export function MenuItem({onClick, disabled, children}: { readonly onClick?: () => void; readonly disabled?: boolean; readonly children: ReactNode }) {
    return (
        <BaseMenu.Item className="menu-item" disabled={disabled} onClick={onClick}>
            {children}
        </BaseMenu.Item>
    );
}

export function ContextMenuItem({onClick, disabled, children}: { readonly onClick?: () => void; readonly disabled?: boolean; readonly children: ReactNode }) {
    return (
        <BaseContextMenu.Item className="menu-item" disabled={disabled} onClick={onClick}>
            {children}
        </BaseContextMenu.Item>
    );
}

export function MenuSeparator() {
    return <div role="separator" className={MENU_SEPARATOR}/>;
}
