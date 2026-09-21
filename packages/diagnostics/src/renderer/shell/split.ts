/*
 * The whole limit of the model. Columns of cells instead of a free tree means "at most three by
 * three" is these two numbers, not a counter laid over a shape that could hold more, so every
 * layout the model can express is a layout that is allowed.
 */
export const MAX_COLUMNS = 3;
export const MAX_CELLS = 3;

/** The smallest a cell may be dragged to, as a share of its axis. Below this nothing in it is legible. */
export const MIN_SHARE = 0.15;

/** How close, in pixels, a splitter has to come to the middle of its two neighbors to land on it. */
export const EVEN_SNAP_PX = 8;

/** A cell has five drop points: the four edges split, the middle takes over the panel standing there. */
export type SplitZone = 'left' | 'right' | 'up' | 'down' | 'center';
export type SplitDirection = Exclude<SplitZone, 'center'>;

/** What one cell shows: a panel, and the device it reads from, or null for a panel without one. */
export type CellRef = {
    readonly deviceId: string | null;
    readonly panelId: string;
};

export type SplitCell = CellRef & {
    readonly size: number;
};

export type SplitColumn = {
    readonly size: number;
    readonly cells: readonly SplitCell[];
};

export type CellAt = {
    readonly column: number;
    readonly cell: number;
};

export type SplitLayout = {
    readonly columns: readonly SplitColumn[];
    readonly focus: CellAt;
};

/** The identity of a cell's contents. The same pair may stand in the grid only once. */
export const cellKey = (cell: CellRef): string => `${cell.deviceId ?? ''}::${cell.panelId}`;

export const isSameRef = (one: CellRef, other: CellRef): boolean => cellKey(one) === cellKey(other);

const isColumnZone = (zone: SplitZone): boolean => zone === 'left' || zone === 'right';

/* Sizes are shares of an axis, so whatever a hand-edited file leaves behind falls back to an even split. */
const normalize = <T extends { size: number }>(items: readonly T[]): T[] => {
    if (items.length === 0) {
        return [];
    }

    const total = items.reduce((sum, item) => sum + (Number.isFinite(item.size) && item.size > 0 ? item.size : 0), 0);

    if (total <= 0) {
        return items.map(item => ({...item, size: 1 / items.length}));
    }

    return items.map(item => ({...item, size: (Number.isFinite(item.size) && item.size > 0 ? item.size : 0) / total}));
};

const clampFocus = (columns: readonly SplitColumn[], focus: CellAt): CellAt => {
    const column = Math.min(Math.max(focus.column, 0), columns.length - 1);
    const cells = columns[column]?.cells.length ?? 1;
    return {column, cell: Math.min(Math.max(focus.cell, 0), cells - 1)};
};

/* Every operation ends here: shares add up again and the focus lands on a cell that still exists. */
const settled = (columns: readonly SplitColumn[], focus: CellAt): SplitLayout => {
    const settledColumns = normalize(columns).map(column => ({...column, cells: normalize(column.cells)}));
    return {columns: settledColumns, focus: clampFocus(settledColumns, focus)};
};

export const singleLayout = (ref: CellRef): SplitLayout => ({
    columns: [{size: 1, cells: [{...ref, size: 1}]}],
    focus: {column: 0, cell: 0}
});

export const cellCount = (layout: SplitLayout): number => layout.columns.reduce((total, column) => total + column.cells.length, 0);

export const cellAt = (layout: SplitLayout, at: CellAt): SplitCell | null => layout.columns[at.column]?.cells[at.cell] ?? null;

export const isSameCell = (one: CellAt, other: CellAt): boolean => one.column === other.column && one.cell === other.cell;

/**
 * A pair without a device is a blank cell waiting to be filled, and there may be several of those.
 * Everything else stands in at most one cell.
 */
export const isUnique = (ref: CellRef): boolean => ref.deviceId !== null;

/** The cell the pair stands in, or null when it is not on screen or may stand in several. */
export const locate = (layout: SplitLayout, ref: CellRef): CellAt | null => {
    if (!isUnique(ref)) {
        return null;
    }

    for (let column = 0; column < layout.columns.length; column += 1) {
        const cell = layout.columns[column].cells.findIndex(candidate => isSameRef(candidate, ref));

        if (cell !== -1) {
            return {column, cell};
        }
    }

    return null;
};

/**
 * Whether a drop on this zone would land. `moving` is the pair being dragged when it already stands
 * in a cell: it leaves that cell, so a column or a cell comes free and a layout that looks full is
 * not. Dropping a pair on the cell it already sits in is nothing, which is why it answers false.
 */
export const canSplit = (layout: SplitLayout, at: CellAt, zone: SplitZone, moving: CellRef | null = null): boolean => {
    if (cellAt(layout, at) === null) {
        return false;
    }

    const source = moving === null ? null : locate(layout, moving);

    if (source !== null && isSameCell(source, at)) {
        return false;
    }

    if (zone === 'center') {
        return true;
    }

    if (isColumnZone(zone)) {
        const freed = source !== null && layout.columns[source.column].cells.length === 1 ? 1 : 0;
        return layout.columns.length - freed < MAX_COLUMNS;
    }

    const leaving = source !== null && source.column === at.column ? 1 : 0;
    return layout.columns[at.column].cells.length - leaving < MAX_CELLS;
};

/* A column that loses its last cell is gone, so the target moves up when it sat behind that column. */
const withoutCell = (columns: readonly SplitColumn[], source: CellAt, target: CellAt): { columns: SplitColumn[]; target: CellAt } => {
    const next = columns.map((column, index) =>
        index === source.column ? {...column, cells: column.cells.filter((_, cell) => cell !== source.cell)} : column
    );
    const emptied = next[source.column].cells.length === 0;

    return {
        columns: emptied ? next.filter((_, index) => index !== source.column) : next,
        target: {
            column: emptied && source.column < target.column ? target.column - 1 : target.column,
            cell: source.column === target.column && source.cell < target.cell ? target.cell - 1 : target.cell
        }
    };
};

/**
 * The one mutation behind both a drag and a split shortcut: a pair lands in a cell's zone. A pair
 * that was already on screen moves rather than appearing twice, and a drop on the middle swaps with
 * the pair that stood there instead of closing it, so nothing falls off the grid by accident.
 */
export const drop = (layout: SplitLayout, ref: CellRef, at: CellAt, zone: SplitZone): SplitLayout => {
    if (!canSplit(layout, at, zone, ref)) {
        return layout;
    }

    const source = locate(layout, ref);

    if (zone === 'center') {
        const replaced = cellAt(layout, at)!;
        const columns = layout.columns.map((column, columnIndex) => ({
            ...column,
            cells: column.cells.map((cell, cellIndex) => {
                if (columnIndex === at.column && cellIndex === at.cell) {
                    return {...cell, ...ref};
                }

                return source !== null && columnIndex === source.column && cellIndex === source.cell
                    ? {...cell, deviceId: replaced.deviceId, panelId: replaced.panelId}
                    : cell;
            })
        }));

        return settled(columns, at);
    }

    const {columns, target} = source === null ? {columns: [...layout.columns], target: at} : withoutCell(layout.columns, source, at);

    if (isColumnZone(zone)) {
        const half = columns[target.column].size / 2;
        const index = zone === 'left' ? target.column : target.column + 1;
        const next = columns.map((column, columnIndex) => (columnIndex === target.column ? {...column, size: half} : column));
        next.splice(index, 0, {size: half, cells: [{...ref, size: 1}]});

        return settled(next, {column: index, cell: 0});
    }

    const column = columns[target.column];
    const half = column.cells[target.cell].size / 2;
    const index = zone === 'up' ? target.cell : target.cell + 1;
    const cells = column.cells.map((cell, cellIndex) => (cellIndex === target.cell ? {...cell, size: half} : cell));
    cells.splice(index, 0, {...ref, size: half});
    const next = columns.map((candidate, columnIndex) => (columnIndex === target.column ? {...candidate, cells} : candidate));

    return settled(next, {column: target.column, cell: index});
};

/** Null when that was the last cell; the caller decides what an empty grid means. */
export const closeCell = (layout: SplitLayout, at: CellAt): SplitLayout | null => {
    if (cellAt(layout, at) === null) {
        return layout;
    }

    if (cellCount(layout) === 1) {
        return null;
    }

    const {columns, target} = withoutCell(layout.columns, at, layout.focus);

    return settled(columns, target);
};

export const focusCell = (layout: SplitLayout, at: CellAt): SplitLayout => (cellAt(layout, at) === null ? layout : {...layout, focus: at});

/** Replaces what the cell in focus shows, which is what clicking a device in the sidebar does. */
export const showIn = (layout: SplitLayout, ref: CellRef, at: CellAt = layout.focus): SplitLayout => {
    const standing = locate(layout, ref);

    if (standing !== null) {
        return focusCell(layout, standing);
    }

    return drop(layout, ref, at, 'center');
};

export const resizeColumns = (layout: SplitLayout, index: number, before: number, after: number): SplitLayout => {
    const columns = layout.columns.map((column, columnIndex) => {
        if (columnIndex === index - 1) {
            return {...column, size: before};
        }

        return columnIndex === index ? {...column, size: after} : column;
    });

    return settled(columns, layout.focus);
};

export const resizeCells = (layout: SplitLayout, column: number, index: number, before: number, after: number): SplitLayout => {
    const columns = layout.columns.map((candidate, columnIndex) => {
        if (columnIndex !== column) {
            return candidate;
        }

        return {
            ...candidate,
            cells: candidate.cells.map((cell, cellIndex) => {
                if (cellIndex === index - 1) {
                    return {...cell, size: before};
                }

                return cellIndex === index ? {...cell, size: after} : cell;
            })
        };
    });

    return settled(columns, layout.focus);
};

/* The span a cell covers on its column's axis, in shares, which is what makes two columns comparable. */
const spanOf = (cells: readonly SplitCell[], index: number): { start: number; end: number } => {
    let start = 0;

    for (let cell = 0; cell < index; cell += 1) {
        start += cells[cell].size;
    }

    return {start, end: start + cells[index].size};
};

/* The neighbor lying most beside the span you left, the topmost one when two lie equally beside it. */
const cellAcross = (cells: readonly SplitCell[], span: { start: number; end: number }): number => {
    let best = 0;
    let most = -1;
    let start = 0;

    for (let cell = 0; cell < cells.length; cell += 1) {
        const end = start + cells[cell].size;
        const overlap = Math.min(end, span.end) - Math.max(start, span.start);

        if (overlap > most) {
            most = overlap;
            best = cell;
        }

        start = end;
    }

    return best;
};

/**
 * The focus one step in a direction, or the layout untouched at the edge of the grid. Sideways it
 * meets the neighboring column where the cell it left was standing, because two columns divide
 * themselves and an index would jump past a cell that is right there.
 */
export const focusDirection = (layout: SplitLayout, direction: SplitDirection): SplitLayout => {
    if (cellAt(layout, layout.focus) === null) {
        return layout;
    }

    if (isColumnZone(direction)) {
        const column = direction === 'left' ? layout.focus.column - 1 : layout.focus.column + 1;

        if (column < 0 || column >= layout.columns.length) {
            return layout;
        }

        const span = spanOf(layout.columns[layout.focus.column].cells, layout.focus.cell);

        return focusCell(layout, {column, cell: cellAcross(layout.columns[column].cells, span)});
    }

    const cell = direction === 'up' ? layout.focus.cell - 1 : layout.focus.cell + 1;

    return cell < 0 || cell >= layout.columns[layout.focus.column].cells.length ? layout : focusCell(layout, {column: layout.focus.column, cell});
};

/**
 * A stored layout can name a panel that no longer exists, hold the same pair twice, or come from a
 * version with wider limits. Everything the model cannot mean is cut here on the way in.
 */
export const cleanLayout = (layout: SplitLayout, panelIds: readonly string[]): SplitLayout | null => {
    const known = new Set(panelIds);
    const seen = new Set<string>();
    const columns: SplitColumn[] = [];

    for (const column of layout.columns) {
        const cells: SplitCell[] = [];

        for (const cell of column.cells) {
            if (!known.has(cell.panelId) || cells.length === MAX_CELLS || (isUnique(cell) && seen.has(cellKey(cell)))) {
                continue;
            }

            seen.add(cellKey(cell));
            cells.push(cell);
        }

        if (cells.length > 0 && columns.length < MAX_COLUMNS) {
            columns.push({...column, cells});
        }
    }

    if (columns.length === 0) {
        return null;
    }

    return settled(columns, layout.focus);
};

/**
 * Where a dragged splitter lands. Two neighbors of the same size is the one split people aim for,
 * and nobody hits it by hand to the pixel, so the middle pulls the line in when it comes close. The
 * distance is measured in pixels rather than in shares: a share of a wide window is a long way, and
 * the pull should feel the same in a cell of any size.
 */
export const snapToEven = (before: number, total: number, span: number, threshold = EVEN_SNAP_PX): number => {
    const middle = total / 2;
    return Math.abs(before - middle) * span <= threshold ? middle : before;
};

/** The rectangle a drop on a zone would take, in shares of the cell it is drawn over. */
export const shapeOf = (zone: SplitZone): { x: number; y: number; width: number; height: number; column: boolean } => {
    switch (zone) {
        case 'left':
            return {x: 0, y: 0, width: 0.5, height: 1, column: true};

        case 'right':
            return {x: 0.5, y: 0, width: 0.5, height: 1, column: true};

        case 'up':
            return {x: 0, y: 0, width: 1, height: 0.5, column: false};

        case 'down':
            return {x: 0, y: 0.5, width: 1, height: 0.5, column: false};

        default:
            return {x: 0, y: 0, width: 1, height: 1, column: false};
    }
};

/** Which of the five zones a point inside a cell's box falls in. */
export const zoneAt = (box: { width: number; height: number }, point: { x: number; y: number }): SplitZone => {
    const edge = 0.28;
    const x = point.x / Math.max(box.width, 1);
    const y = point.y / Math.max(box.height, 1);
    const distances: [SplitZone, number][] = [
        ['left', x],
        ['right', 1 - x],
        ['up', y],
        ['down', 1 - y]
    ];
    const [zone, distance] = distances.reduce((best, candidate) => (candidate[1] < best[1] ? candidate : best));

    return distance < edge ? zone : 'center';
};
