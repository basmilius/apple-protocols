import type { ReactElement, ReactNode } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import clsx from 'clsx';
import { TOOLTIP_KBD } from './classes';

type Side = 'top' | 'bottom' | 'left' | 'right';

/* One provider per app. Tooltips share a delay, so moving along a row of buttons feels instant. */
export function TooltipProvider({children}: { readonly children: ReactNode }) {
    return (
        <BaseTooltip.Provider delay={150} closeDelay={0}>
            {children}
        </BaseTooltip.Provider>
    );
}

type TooltipProps = {
    readonly label: ReactNode;
    /* A shortcut, printed as this platform prints it, or a short phrase about a key. */
    readonly kbd?: string;
    readonly side?: Side;
    readonly sideOffset?: number;
    /* The trigger element. Its own children and handlers are kept; Base UI merges the tooltip props in. */
    readonly children: ReactElement<Record<string, unknown>>;
};

export function Tooltip({label, kbd, side = 'top', sideOffset = 6, children}: TooltipProps) {
    return (
        <BaseTooltip.Root>
            <BaseTooltip.Trigger render={children}/>
            <BaseTooltip.Portal>
                <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="tooltip-positioner">
                    <BaseTooltip.Popup className="tooltip-popup">
                        <span className="flex items-center px-[9px] py-[5px] whitespace-nowrap">
                            <span>{label}</span>
                            {kbd && <kbd className={clsx(TOOLTIP_KBD, 'ml-2')}>{kbd}</kbd>}
                        </span>
                    </BaseTooltip.Popup>
                </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
        </BaseTooltip.Root>
    );
}
