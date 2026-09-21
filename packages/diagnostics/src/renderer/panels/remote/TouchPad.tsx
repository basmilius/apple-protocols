import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import clsx from 'clsx';
import { isCallFailure } from '@shared/contract';
import { invoke, messageOf } from '@/client';

/* The plane the Apple TV's HID touch device reports: its descriptor runs 0 to 1000 on both axes. */
export const TOUCH_RANGE = 1000;

/** HID touch phases, which are 1-based where UIKit's `_touchC` phases are 0-based. */
const PHASE_BEGAN = 1;
const PHASE_MOVED = 2;
const PHASE_ENDED = 4;

/** The SDK's own swipe steps every 50 ms; the same rate keeps a drag from flooding the data stream. */
const MOVE_INTERVAL_MS = 50;

/** Under this distance, in touch units, a press that lifted again reads as a tap. */
const TAP_DISTANCE = 12;

/** Held longer than this, a tap that never moved becomes a long press of Select. */
const HOLD_MS = 500;

type Point = {
    readonly x: number;
    readonly y: number;
};

type Gesture = {
    readonly kind: 'tap' | 'hold' | 'swipe';
    readonly from: Point;
    readonly to: Point;
    readonly finger: number;
    readonly durationMs: number;
    readonly error: string | null;
};

type TouchPadProps = {
    readonly deviceId: string;
    readonly disabled: boolean;
    readonly finger: number;
};

const pointOf = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number): number => Math.min(TOUCH_RANGE, Math.max(0, Math.round(value)));

    return {
        x: clamp(((event.clientX - bounds.left) / bounds.width) * TOUCH_RANGE),
        y: clamp(((event.clientY - bounds.top) / bounds.height) * TOUCH_RANGE)
    };
};

const percent = (value: number): string => `${(value / TOUCH_RANGE) * 100}%`;

/*
 * Send drags through raw `_hidT` because the SDK keeps touch phases private.
 * The HID touch device has no click, so stationary presses send Select.
 * Wait for movement beyond the tap threshold before starting a touch stream.
 */
export function TouchPad({deviceId, disabled, finger}: TouchPadProps) {
    const [trail, setTrail] = useState<readonly Point[]>([]);
    const [gesture, setGesture] = useState<Gesture | null>(null);
    const start = useRef<{ point: Point; time: number } | null>(null);
    const dragging = useRef(false);
    const lastMove = useRef(0);
    /* Phases must reach the device in the order they happened, so each send waits for the last. */
    const queue = useRef<Promise<void>>(Promise.resolve());
    const failure = useRef<string | null>(null);

    const send = (point: Point, phase: number): Promise<void> => {
        queue.current = queue.current.then(async () => {
            try {
                const result = await invoke('raw:send', {
                    deviceId,
                    transport: 'companionLink',
                    id: 'cl.sendHidTouchEvent',
                    args: {finger, phase, x: point.x, y: point.y}
                });

                if (isCallFailure(result)) {
                    failure.current = result.error.message;
                }
            } catch (error) {
                failure.current = messageOf(error);
            }
        });

        return queue.current;
    };

    const press = (durationMs: number): Promise<void> => {
        queue.current = queue.current.then(async () => {
            try {
                const result = await invoke('device:call', {
                    deviceId,
                    root: 'companionLink',
                    path: 'tap',
                    args: durationMs >= HOLD_MS ? [durationMs] : []
                });

                if (isCallFailure(result)) {
                    failure.current = result.error.message;
                }
            } catch (error) {
                failure.current = messageOf(error);
            }
        });

        return queue.current;
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (disabled) {
            return;
        }

        const point = pointOf(event);

        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {point, time: performance.now()};
        dragging.current = false;
        lastMove.current = performance.now();
        failure.current = null;
        setTrail([point]);
        setGesture(null);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const began = start.current;

        if (began === null || performance.now() - lastMove.current < MOVE_INTERVAL_MS) {
            return;
        }

        const point = pointOf(event);

        if (!dragging.current) {
            if (Math.hypot(point.x - began.point.x, point.y - began.point.y) < TAP_DISTANCE) {
                return;
            }

            dragging.current = true;
            void send(began.point, PHASE_BEGAN);
        }

        lastMove.current = performance.now();
        setTrail(current => [...current, point]);
        void send(point, PHASE_MOVED);
    };

    const onPointerUp = async (event: ReactPointerEvent<HTMLDivElement>): Promise<void> => {
        const began = start.current;

        if (began === null) {
            return;
        }

        const point = pointOf(event);
        const swiped = dragging.current;
        const durationMs = Math.round(performance.now() - began.time);

        start.current = null;
        dragging.current = false;
        setTrail(current => [...current, point]);

        if (swiped) {
            await send(point, PHASE_ENDED);
        } else {
            await press(durationMs);
        }

        setGesture({
            kind: swiped ? 'swipe' : (durationMs >= HOLD_MS ? 'hold' : 'tap'),
            from: began.point,
            to: point,
            finger,
            durationMs,
            error: failure.current
        });
    };

    const failed = gesture !== null && gesture.error !== null;
    const last = trail[trail.length - 1] ?? null;

    return (
        <div className="flex flex-col gap-1.5">
            <div
                role="application"
                aria-label="Touch surface. Press to tap, drag to swipe."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={event => void onPointerUp(event)}
                onPointerCancel={event => void onPointerUp(event)}
                className={clsx('relative h-44 w-64 touch-none overflow-hidden rounded-2xl border border-border bg-surface-sunken', disabled ? 'opacity-50' : 'cursor-crosshair hover:border-border-strong')}
            >
                <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border-soft"/>
                <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-border-soft"/>
                {trail.length > 1 && (
                    <svg aria-hidden viewBox={`0 0 ${TOUCH_RANGE} ${TOUCH_RANGE}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                        <polyline
                            points={trail.map(point => `${point.x},${point.y}`).join(' ')}
                            fill="none"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            className={failed ? 'stroke-status-error' : 'stroke-accent'}
                        />
                    </svg>
                )}
                {last !== null && (
                    <span
                        aria-hidden
                        className={clsx('absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full', failed ? 'bg-status-error' : 'bg-accent')}
                        style={{left: percent(last.x), top: percent(last.y)}}
                    />
                )}
            </div>
            <span className={clsx('mono text-2xs', failed ? 'text-status-error' : 'text-text-muted')}>{describe(gesture)}</span>
        </div>
    );
}

function describe(gesture: Gesture | null): string {
    if (gesture === null) {
        return `press to tap, drag to swipe (0 to ${TOUCH_RANGE})`;
    }

    if (gesture.error !== null) {
        return gesture.error;
    }

    if (gesture.kind === 'tap') {
        return `select, ${gesture.durationMs} ms`;
    }

    if (gesture.kind === 'hold') {
        return `select held ${gesture.durationMs} ms`;
    }

    return `swipe(${gesture.from.x}, ${gesture.from.y}) to (${gesture.to.x}, ${gesture.to.y}) finger ${gesture.finger}, ${gesture.durationMs} ms`;
}
