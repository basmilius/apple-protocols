import { Fragment, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { useLayout } from '@/state/layout';
import { ErrorBoundary } from '@/ui';
import { panelById } from '@/panels/registry';
import { CellToolbar } from './CellToolbar';
import { carriesCell, draggingRef, readCell } from './cell-drag';
import { canSplit, cellAt, type CellAt, cellCount, cellKey, isSameCell, MIN_SHARE, shapeOf, snapToEven, type SplitLayout, type SplitZone, zoneAt } from './split';

/*
 * Dragging the line between two columns or two cells. Sizes are shares of an axis rather than
 * pixels, so the grid keeps its proportions when the window changes size; the drag measures against
 * the box the two neighbors share, which is the only place a share can be turned back into a
 * pointer position.
 */
const splitDrag = (
    axis: 'x' | 'y',
    before: number,
    after: number,
    onShares: (before: number, after: number) => void
): ((event: ReactPointerEvent<HTMLElement>) => void) => {
    return (event: ReactPointerEvent<HTMLElement>): void => {
        event.preventDefault();
        const handle = event.currentTarget;
        // The splitter's parent is the box the two neighbors share, which is what a share is a share of.
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

/*
 * The rectangle the dragged cell would take, drawn over the column rather than over the cell the
 * pointer is on: a side drop on a cell in a column of three gives a whole new column. You aim at a
 * cell and get a column, so that has to be visible before the pointer is let go.
 */
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
    /* More than one cell on screen, which is what gives a cell a bar of its own. */
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

    /* Where the drag would land, or null for a drop the grid cannot take: the pointer then reads
       `no-drop` and nothing lights up. A target that is not there needs no explanation. */
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
            // A press anywhere in a cell is what moves the focus to it.
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
    /* Which cell the drag is over and where in it. It is held here and not in the cell, because a
       side drop reaches across the whole column and the indicator is drawn against that box. */
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

/*
 * The panels beside each other: columns of cells, at most three by three. The model and its limits
 * are pure (`shell/split.ts`); this only draws what the layout says and hands a drag back to it.
 */
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
