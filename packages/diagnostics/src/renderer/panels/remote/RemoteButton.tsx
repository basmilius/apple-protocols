import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Icon, Tooltip } from '@/ui';
import type { DeviceCall } from '@/panels/hooks';
import type { FaceCommand, Transport } from './commands';
import { type PressState, type RegisterTrigger, useCommandPress } from './press';

export const KEY_MOTION = 'cursor-default transition-[scale] duration-[120ms] active:scale-[0.96]';

export const KEY_SURFACE = 'bg-surface-sunken text-text-muted hover:bg-surface-hover hover:text-text active:bg-surface-active disabled:text-text-faint disabled:hover:bg-surface-sunken disabled:hover:text-text-faint';

export const KEY_HELD = 'bg-surface-active text-text ring-2 ring-accent';

export function toneOf(state: PressState): string | undefined {
    if (state === 'failed') {
        return 'text-status-error';
    }

    return undefined;
}

type RemoteButtonProps = {
    readonly command: FaceCommand;
    /** Overrides the glyph where the state decides it, as play and pause do. */
    readonly icon?: LucideIcon;
    readonly transport: Transport;
    readonly call: DeviceCall;
    readonly disabled: boolean;
    readonly register?: RegisterTrigger;
};

export function RemoteButton({command, icon, transport, call, disabled, register}: RemoteButtonProps) {
    const press = useCommandPress({command, transport, call, disabled, register});

    return (
        <Tooltip label={press.error ?? command.tooltip ?? command.label} kbd={command.kbd}>
            <button
                type="button"
                aria-label={command.label}
                disabled={disabled}
                {...press.handlers}
                className={clsx('flex size-11 shrink-0 items-center justify-center rounded-full', KEY_MOTION, KEY_SURFACE, press.state === 'holding' && KEY_HELD)}
            >
                <Icon icon={icon ?? command.icon} size={18} className={toneOf(press.state)}/>
            </button>
        </Tooltip>
    );
}
