import type { CellRef } from './split';

/** The MIME the grid marks its own drags with, so a file dropped on a cell is not one of them. */
export const CELL_DRAG_TYPE = 'application/x-diagnostics-cell';

/*
 * What is being dragged, kept outside the `DataTransfer`: a browser hides the payload of a drag
 * from `dragover`, and the grid has to know which pair is moving to decide whether a drop fits.
 */
let dragging: CellRef | null = null;

export function setDragging(ref: CellRef | null): void {
    dragging = ref;
}

export function draggingRef(): CellRef | null {
    return dragging;
}

export function carriesCell(transfer: DataTransfer): boolean {
    return Array.from(transfer.types).includes(CELL_DRAG_TYPE);
}

export function readCell(transfer: DataTransfer): CellRef | null {
    try {
        const raw = transfer.getData(CELL_DRAG_TYPE);
        return raw.length === 0 ? null : (JSON.parse(raw) as CellRef);
    } catch {
        return null;
    }
}

export function writeCell(transfer: DataTransfer, ref: CellRef): void {
    transfer.setData(CELL_DRAG_TYPE, JSON.stringify(ref));
    transfer.effectAllowed = 'move';
    setDragging(ref);
}
