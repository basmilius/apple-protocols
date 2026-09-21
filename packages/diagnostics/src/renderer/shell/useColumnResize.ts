import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/* Which edge the column hangs from, and with it the axis the drag runs along. A column pinned to
   the window's right edge grows as the pointer moves left; the same holds for a row pinned to the
   bottom. */
type ColumnEdge = 'left' | 'right' | 'top' | 'bottom';

type ColumnResizeOptions = {
    /* What the column is wide, or the row is tall, right now, in whole pixels. */
    readonly size: number;
    readonly min: number;
    readonly from: ColumnEdge;
    /* Read at drag time, so a window resize between two drags is taken into account. */
    max?(): number;
    /* Where the dragged size goes; called on every move, so the column follows the pointer. */
    onSize(size: number): void;
};

export const clampColumnSize = (options: Pick<ColumnResizeOptions, 'min' | 'max'>, size: number): number => {
    const max = Math.max(options.min, options.max?.() ?? Number.MAX_SAFE_INTEGER);
    return Math.max(options.min, Math.min(Math.round(size), max));
};

const along = (from: ColumnEdge, event: { clientX: number; clientY: number }): number => (from === 'left' || from === 'right' ? event.clientX : event.clientY);

/* The edge the column is pinned to, in page coordinates, or the window's own when there is no box yet. */
const anchorOf = (from: ColumnEdge, rect: DOMRect | undefined): number => {
    switch (from) {
        case 'left':
            return rect?.left ?? 0;
        case 'right':
            return rect?.right ?? window.innerWidth;
        case 'top':
            return rect?.top ?? 0;
        case 'bottom':
            return rect?.bottom ?? window.innerHeight;
    }
};

/*
 * One resizable column or row: a handle that drags the size its owner keeps. The handle takes the
 * pointer capture, so the drag survives leaving the few pixels it is wide, and `[data-resizing]` on
 * the column turns off the transition on that size for as long as it lasts.
 */
export function useColumnResize(ref: RefObject<HTMLElement | null>, options: ColumnResizeOptions): { startResize(event: ReactPointerEvent<HTMLElement>): void } {
    const startResize = (event: ReactPointerEvent<HTMLElement>): void => {
        event.preventDefault();
        const handle = event.currentTarget;
        const column = ref.current;
        const anchor = anchorOf(options.from, column?.getBoundingClientRect());
        /* The far edge grows as the pointer comes towards it; the near edge grows as it goes away. */
        const growsTowardsAnchor = options.from === 'right' || options.from === 'bottom';
        column?.setAttribute('data-resizing', 'true');

        const onMove = (move: PointerEvent): void => {
            const reach = along(options.from, move);
            options.onSize(clampColumnSize(options, growsTowardsAnchor ? anchor - reach : reach - anchor));
        };

        const onUp = (): void => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.releasePointerCapture(event.pointerId);
            column?.removeAttribute('data-resizing');
        };

        handle.setPointerCapture(event.pointerId);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    };

    return {startResize};
}
