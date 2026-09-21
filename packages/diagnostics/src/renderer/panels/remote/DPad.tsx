import type { CSSProperties } from 'react';
import clsx from 'clsx';
import { Icon, Tooltip } from '@/ui';
import type { DeviceCall } from '@/panels/hooks';
import { DPAD_DIRECTIONS, DPAD_SELECT, type FaceCommand, type Transport } from './commands';
import { KEY_HELD, KEY_MOTION, KEY_SURFACE, toneOf } from './RemoteButton';
import { type RegisterTrigger, useCommandPress } from './press';

/* Each direction clips a quarter of the ring, with a 2px seam between quarters. */
const SEGMENTS: Readonly<Record<string, { readonly clip: string; readonly place: string }>> = {
    up: {clip: 'polygon(50% calc(50% - 2px), 2px 0%, calc(100% - 2px) 0%)', place: 'items-start justify-center pt-[18px]'},
    right: {clip: 'polygon(calc(50% + 2px) 50%, 100% 2px, 100% calc(100% - 2px))', place: 'items-center justify-end pr-[18px]'},
    down: {clip: 'polygon(50% calc(50% + 2px), calc(100% - 2px) 100%, 2px 100%)', place: 'items-end justify-center pb-[18px]'},
    left: {clip: 'polygon(calc(50% - 2px) 50%, 0% calc(100% - 2px), 0% 2px)', place: 'items-center justify-start pl-[18px]'}
};

/** The hole the select key sits in, as a radius in pixels. The key itself is 64 across. */
const HOLE = 36;

type SegmentProps = {
    readonly command: FaceCommand;
    readonly transport: Transport;
    readonly call: DeviceCall;
    readonly disabled: boolean;
    readonly register: RegisterTrigger;
};

function DPadSegment({command, transport, call, disabled, register}: SegmentProps) {
    const press = useCommandPress({command, transport, call, disabled, register});
    const segment = SEGMENTS[command.id];

    const style: CSSProperties = {
        clipPath: segment.clip,
        WebkitMaskImage: `radial-gradient(circle, transparent ${HOLE}px, black ${HOLE}px)`,
        maskImage: `radial-gradient(circle, transparent ${HOLE}px, black ${HOLE}px)`
    };

    return (
        <Tooltip label={press.error ?? command.label} kbd={command.kbd}>
            <button
                type="button"
                aria-label={command.label}
                disabled={disabled}
                style={style}
                {...press.handlers}
                className={clsx('absolute inset-0 flex rounded-full', segment.place, KEY_MOTION, KEY_SURFACE, press.state === 'holding' && KEY_HELD)}
            >
                <Icon icon={command.icon} size={18} className={toneOf(press.state)}/>
            </button>
        </Tooltip>
    );
}

type DPadProps = {
    readonly transport: Transport;
    readonly call: DeviceCall;
    readonly disabled: boolean;
    readonly register: RegisterTrigger;
};

export function DPad({transport, call, disabled, register}: DPadProps) {
    const select = useCommandPress({command: DPAD_SELECT, transport, call, disabled, register});

    return (
        <div className="relative size-[168px] shrink-0">
            {DPAD_DIRECTIONS.map(command => (
                <DPadSegment key={command.id} command={command} transport={transport} call={call} disabled={disabled} register={register}/>
            ))}
            <Tooltip label={select.error ?? DPAD_SELECT.label} kbd={DPAD_SELECT.kbd}>
                <button
                    type="button"
                    aria-label={DPAD_SELECT.label}
                    disabled={disabled}
                    {...select.handlers}
                    className={clsx(
                        'absolute top-1/2 left-1/2 z-10 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
                        KEY_MOTION,
                        KEY_SURFACE,
                        select.state === 'holding' && KEY_HELD
                    )}
                >
                    <Icon icon={DPAD_SELECT.icon} size={18} className={toneOf(select.state)}/>
                </button>
            </Tooltip>
        </div>
    );
}
