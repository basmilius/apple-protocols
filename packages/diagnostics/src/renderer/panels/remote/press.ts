import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '@/client';
import type { DeviceCall } from '@/panels/hooks';
import { callFor, DOUBLE_MS, type FaceCommand, type Gesture, HOLD_MS, type Transport } from './commands';

const FLASH_MS = 400;

export type PressState = 'idle' | 'holding' | 'busy' | 'ok' | 'failed';

export type CommandPress = {
    readonly state: PressState;
    /** The reason the last run failed, which the tooltip shows in place of the label. */
    readonly error: string | null;
    readonly handlers: {
        readonly onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
        readonly onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
        readonly onPointerLeave: () => void;
        readonly onPointerCancel: () => void;
        readonly onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    };
};

export type RegisterTrigger = (id: string, trigger: (gesture: Gesture) => void) => () => void;

type Options = {
    readonly command: FaceCommand;
    readonly transport: Transport;
    readonly call: DeviceCall;
    readonly disabled: boolean;
    /** Lets the face run this command from the keyboard and see the same feedback. */
    readonly register?: RegisterTrigger;
};

/* Maps pointer input to tap, hold or double press and tracks command feedback. */
export function useCommandPress({command, transport, call, disabled, register}: Options): CommandPress {
    const [state, setState] = useState<PressState>('idle');
    const [error, setError] = useState<string | null>(null);

    const downAt = useRef<number | null>(null);
    const holdTimer = useRef<number | null>(null);
    const doubleTimer = useRef<number | null>(null);
    const flashTimer = useRef<number | null>(null);
    const live = useRef(true);

    useEffect(() => {
        live.current = true;

        return () => {
            live.current = false;

            for (const timer of [holdTimer, doubleTimer, flashTimer]) {
                if (timer.current !== null) {
                    window.clearTimeout(timer.current);
                    timer.current = null;
                }
            }
        };
    }, []);

    const send = useCallback(
        async (gesture: Gesture, heldMs: number): Promise<void> => {
            const spec = callFor(command, gesture, transport, heldMs);

            setState('busy');
            setError(null);

            try {
                await call(spec.root, spec.path, spec.args);

                if (!live.current) {
                    return;
                }

                setState('ok');
                flashTimer.current = window.setTimeout(() => setState(current => (current === 'ok' ? 'idle' : current)), FLASH_MS);
            } catch (failure) {
                if (!live.current) {
                    return;
                }

                setState('failed');
                setError(messageOf(failure));
            }
        },
        [call, command, transport]
    );

    const trigger = useCallback(
        (gesture: Gesture): void => {
            if (disabled) {
                return;
            }

            void send(gesture, gesture === 'hold' ? HOLD_MS : 0);
        },
        [disabled, send]
    );

    useEffect(() => {
        if (register === undefined) {
            return;
        }

        return register(command.id, trigger);
    }, [register, command.id, trigger]);

    const clearHold = useCallback((): void => {
        if (holdTimer.current !== null) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }
    }, []);

    const cancel = useCallback((): void => {
        clearHold();
        downAt.current = null;
        setState(current => (current === 'holding' ? 'idle' : current));
    }, [clearHold]);

    const onPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>): void => {
            if (disabled || event.button !== 0) {
                return;
            }

            /* Keep focus on the remote so keyboard shortcuts continue to work after a click. */
            event.preventDefault();

            downAt.current = performance.now();
            clearHold();
            holdTimer.current = window.setTimeout(() => setState('holding'), HOLD_MS);
        },
        [clearHold, disabled]
    );

    const onPointerUp = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>): void => {
            const startedAt = downAt.current;

            clearHold();
            downAt.current = null;

            if (disabled || startedAt === null || event.button !== 0) {
                return;
            }

            const held = Math.round(performance.now() - startedAt);

            if (held >= HOLD_MS) {
                void send('hold', held);

                return;
            }

            if (command.promotesToDouble !== true) {
                void send('tap', 0);

                return;
            }

            if (doubleTimer.current !== null) {
                window.clearTimeout(doubleTimer.current);
                doubleTimer.current = null;
                void send('double', 0);

                return;
            }

            /* Wait for a second tap; sending the single press now would produce three presses on a double click. */
            doubleTimer.current = window.setTimeout(() => {
                doubleTimer.current = null;
                void send('tap', 0);
            }, DOUBLE_MS);
        },
        [clearHold, command.promotesToDouble, disabled, send]
    );

    const onClick = useCallback(
        (event: ReactMouseEvent<HTMLButtonElement>): void => {
            /* A zero-detail click is keyboard activation; pointer activation was already handled. */
            if (!disabled && event.detail === 0) {
                void send('tap', 0);
            }
        },
        [disabled, send]
    );

    return {
        state,
        error,
        handlers: {
            onPointerDown,
            onPointerUp,
            onPointerLeave: cancel,
            onPointerCancel: cancel,
            onClick
        }
    };
}
