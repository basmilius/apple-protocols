import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/* The pinned edge determines which direction increases the size. */
type ColumnEdge = 'left' | 'right' | 'top' | 'bottom';

type ColumnResizeOptions = {
    /* Width or height in whole pixels. */
    readonly size: number;
    readonly min: number;
    readonly from: ColumnEdge;
    /* Read at drag time, so a window resize between two drags is taken into account. */
    max?(): number;
    /* Called on each pointer move. */
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

/* Capture the pointer so resizing continues outside the handle. Set `data-resizing` to disable size transitions. */
export function useColumnResize(ref: RefObject<HTMLElement | null>, options: ColumnResizeOptions): { startResize(event: ReactPointerEvent<HTMLElement>): void } {
    const startResize = (event: ReactPointerEvent<HTMLElement>): void => {
        event.preventDefault();
        const handle = event.currentTarget;
        const column = ref.current;
        const anchor = anchorOf(options.from, column?.getBoundingClientRect());
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
