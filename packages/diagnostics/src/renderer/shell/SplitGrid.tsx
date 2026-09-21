import { Fragment, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { useLayout } from '@/state/layout';
import { ErrorBoundary } from '@/ui';
import { panelById } from '@/panels/registry';
import { CellToolbar } from './CellToolbar';
import { carriesCell, draggingRef, readCell } from './cell-drag';
import { canSplit, cellAt, type CellAt, cellCount, cellKey, isSameCell, MIN_SHARE, shapeOf, snapToEven, type SplitLayout, type SplitZone, zoneAt } from './split';

/* Use axis shares to preserve proportions on resize. Measure the drag against the two neighbors' shared box. */
const splitDrag = (
    axis: 'x' | 'y',
    before: number,
    after: number,
    onShares: (before: number, after: number) => void
): ((event: ReactPointerEvent<HTMLElement>) => void) => {
    return (event: ReactPointerEvent<HTMLElement>): void => {
        event.preventDefault();
        const handle = event.currentTarget;
        const box = handle.parentElement?.getBoundingClientRect();
        const span = axis === 'x' ? (box?.width ?? 0) : (box?.height ?? 0);

        if (span === 0) {
            return;
        }

        const start = axis === 'x' ? event.clientX : event.clientY;
        const total = before + after;

        const onMove = (move: PointerEvent): void => {
            const moved = ((axis === 'x' ? move.clientX : move.clientY) - start) / span;
            const next = snapToEven(Math.max(MIN_SHARE * total, Math.min(total - MIN_SHARE * total, before + moved)), total, span);
            onShares(next, total - next);
        };

        const onUp = (): void => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.releasePointerCapture(event.pointerId);
        };

        handle.setPointerCapture(event.pointerId);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    };
};

function Splitter({axis, onPointerDown}: { readonly axis: 'x' | 'y'; readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
    return (
        <div
            role="separator"
            aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
            className={clsx('relative shrink-0 bg-border transition-colors hover:bg-accent', axis === 'x' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
            onPointerDown={onPointerDown}
        >
            {/* The line is one pixel, but nobody can hit one pixel: the grab area reaches past it. */}
            <span className={clsx('absolute', axis === 'x' ? '-inset-x-1 inset-y-0' : 'inset-x-0 -inset-y-1')}/>
        </div>
    );
}

/* Side drops create a column, so preview them across the column rather than just the target cell. */
function DropIndicator({box, zone}: { readonly box: { top: number; height: number }; readonly zone: SplitZone }) {
    const shape = shapeOf(zone);

    return (
        <div
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-sm border-2 border-accent bg-accent/15 transition-all duration-100"
            style={{
                left: `${shape.x * 100}%`,
                width: `${shape.width * 100}%`,
                top: shape.column ? 0 : box.top + shape.y * box.height,
                height: shape.column ? '100%' : shape.height * box.height
            }}
        />
    );
}

function Cell({at, focused, split, onZone}: {
    readonly at: CellAt;
    readonly focused: boolean;
    readonly split: boolean;
    readonly onZone: (zone: SplitZone | null, box: { top: number; height: number }) => void;
}) {
    const layout = useLayout(state => state.layout);
    const focusAt = useLayout(state => state.focusAt);
    const dropAt = useLayout(state => state.dropAt);
    const cell = cellAt(layout, at);

    if (cell === null) {
        return null;
    }

    const panel = panelById(cell.panelId);
    const Panel = panel?.component ?? null;

    /* Return null for an invalid drop so the browser shows `no-drop`. */
    const zoneFor = (event: ReactDragEvent<HTMLElement>): SplitZone | null => {
        if (!carriesCell(event.dataTransfer)) {
            return null;
        }

        const box = event.currentTarget.getBoundingClientRect();
        const here = zoneAt(box, {x: event.clientX - box.left, y: event.clientY - box.top});

        return canSplit(layout, at, here, draggingRef()) ? here : null;
    };

    const boxIn = (element: HTMLElement): { top: number; height: number } => ({top: element.offsetTop, height: element.offsetHeight});

    const body = (
        <div className="relative min-h-0 grow overflow-hidden bg-surface">
            <ErrorBoundary label={`The ${panel?.title ?? cell.panelId} panel failed to render`} resetKeys={[cellKey(cell)]}>
                {Panel === null ? null : <Panel deviceId={cell.deviceId}/>}
            </ErrorBoundary>
        </div>
    );

    return (
        <div
            className="flex min-h-0 min-w-0 grow flex-col overflow-hidden"
            onPointerDownCapture={() => focusAt(at)}
            onFocusCapture={() => focusAt(at)}
            onDragOver={event => {
                const next = zoneFor(event);

                if (next !== null) {
                    // Only a prevented dragover accepts the drop; without it the browser refuses it.
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                }

                onZone(next, boxIn(event.currentTarget));
            }}
            onDragLeave={event => {
                // A drag crossing into a child fires leave on the parent; only leaving the cell counts.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    onZone(null, boxIn(event.currentTarget));
                }
            }}
            onDrop={event => {
                const here = zoneFor(event);
                const dragged = readCell(event.dataTransfer);
                onZone(null, boxIn(event.currentTarget));

                if (here === null || dragged === null) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                dropAt(dragged, at, here);
            }}
        >
            {/* One cell means the window's top bar speaks for the panel, and a second bar under it
                would say the same thing twice. */}
            {split ? (
                <CellToolbar at={at} cell={cell} focused={focused}>
                    {body}
                </CellToolbar>
            ) : (
                body
            )}
        </div>
    );
}

function Column({layout, at}: { readonly layout: SplitLayout; readonly at: number }) {
    const resizeCell = useLayout(state => state.resizeCell);
    const column = layout.columns[at]!;
    /* Keep the indicator at column level because side drops span the column. */
    const [drop, setDrop] = useState<{ zone: SplitZone; box: { top: number; height: number } } | null>(null);

    const resize = (cell: number): ((event: ReactPointerEvent<HTMLElement>) => void) =>
        splitDrag('y', column.cells[cell - 1]!.size, column.cells[cell]!.size, (before, after) => resizeCell(at, cell, before, after));

    return (
        <div className="relative flex min-h-0 min-w-0 flex-col" style={{flex: `${column.size} 1 0`}}>
            {drop !== null && <DropIndicator box={drop.box} zone={drop.zone}/>}
            {column.cells.map((cell, index) => (
                <Fragment key={`${cellKey(cell)}-${index}`}>
                    {index > 0 && <Splitter axis="y" onPointerDown={resize(index)}/>}
                    <div className="flex min-h-0 flex-col" style={{flex: `${cell.size} 1 0`}}>
                        <Cell
                            at={{column: at, cell: index}}
                            focused={isSameCell(layout.focus, {column: at, cell: index})}
                            split={cellCount(layout) > 1}
                            onZone={(zone, box) => setDrop(zone === null ? null : {zone, box})}
                        />
                    </div>
                </Fragment>
            ))}
        </div>
    );
}

export function SplitGrid() {
    const layout = useLayout(state => state.layout);
    const resizeColumn = useLayout(state => state.resizeColumn);

    const resize = (column: number): ((event: ReactPointerEvent<HTMLElement>) => void) =>
        splitDrag('x', layout.columns[column - 1]!.size, layout.columns[column]!.size, (before, after) => resizeColumn(column, before, after));

    return (
        <div className="absolute inset-0 flex bg-border">
            {layout.columns.map((column, index) => (
                <Fragment key={`${cellKey(column.cells[0]!)}-${index}`}>
                    {index > 0 && <Splitter axis="x" onPointerDown={resize(index)}/>}
                    <Column layout={layout} at={index}/>
                </Fragment>
            ))}
        </div>
    );
}
