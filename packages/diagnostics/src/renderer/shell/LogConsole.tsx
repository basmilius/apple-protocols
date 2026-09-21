import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { Copy, PanelBottom, PanelRight, Pause, Play, Trash2, X } from 'lucide-react';
import { DEBUG_GROUPS, type DebugGroup, type LogEntry } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { useLogs } from '@/panels/hooks';
import { Badge, BTN_GROUP, EmptyState, Field, IconButton, Select, type SelectItem } from '@/ui';
import { LogDetail } from './LogDetail';

/** One row, in the line height `.mono` prints at. */
const ROW_HEIGHT = 18;

/** How close to the end counts as being at the end, in pixels. */
const STICK = 24;

const GROUP_COLOR: Record<DebugGroup, string> = {
    debug: 'text-[var(--group-debug)]',
    error: 'text-[var(--group-error)]',
    info: 'text-[var(--group-info)]',
    net: 'text-[var(--group-net)]',
    raw: 'text-[var(--group-raw)]',
    warn: 'text-[var(--group-warn)]'
};

const ALL = '*';

const asText = (entries: readonly LogEntry[]): string =>
    entries.map(entry => `${formatTime(entry.timestamp)} ${entry.group}${entry.deviceId === null ? '' : ` ${entry.deviceId}`} ${entry.message}`).join('\n');

/* An input has first claim on an arrow key: it moves the caret. */
const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/*
 * Everything the protocol packages logged, with the device each line came from. The list is
 * virtualized: a raw hex dump fills the buffer in seconds and 5000 rendered rows would stall the
 * window. A row is one truncated line, so the entry that is picked is unpacked beside it or under
 * it, depending on which edge the console hangs from.
 */
export function LogConsole() {
    const toggleConsole = useLayout(state => state.toggleConsole);
    const dock = useLayout(state => state.consoleDock);
    const setConsoleDock = useLayout(state => state.setConsoleDock);
    const devices = useDevices(state => state.devices);
    const clear = useDevices(state => state.clearLogs);
    const [groups, setGroups] = useState<readonly DebugGroup[]>(DEBUG_GROUPS);
    const [deviceId, setDeviceId] = useState<string>(ALL);
    const [search, setSearch] = useState('');
    /* The store keeps collecting while the console is paused; only the view stands still, so the
       lines that came in are there to scroll back to the moment it resumes. */
    const [paused, setPaused] = useState(false);
    const [frozen, setFrozen] = useState<readonly LogEntry[] | null>(null);
    const [selected, setSelected] = useState<readonly number[]>([]);
    /* The entry the detail pane is showing. Always one of the selected, never a set of them. */
    const [detailId, setDetailId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [stuck, setStuck] = useState(true);
    const scroller = useRef<HTMLDivElement>(null);
    const bottom = dock === 'bottom';

    const deviceIds = useMemo(() => (deviceId === ALL ? undefined : [deviceId]), [deviceId]);
    const visible = useLogs({deviceIds, search});

    const counts = useMemo(() => {
        const tally = {debug: 0, error: 0, info: 0, net: 0, raw: 0, warn: 0} satisfies Record<DebugGroup, number>;

        for (const entry of visible) {
            tally[entry.group] += 1;
        }

        return tally;
    }, [visible]);

    const rows = useMemo(() => visible.filter(entry => groups.includes(entry.group)), [visible, groups]);

    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    useEffect(() => {
        setFrozen(paused ? rowsRef.current : null);
    }, [paused, groups, deviceId, search]);

    const shown = frozen ?? rows;
    const waiting = frozen === null ? 0 : Math.max(0, rows.length - frozen.length);
    const detail = useMemo(() => shown.find(entry => entry.id === detailId) ?? null, [shown, detailId]);

    const deviceItems = useMemo<SelectItem<string>[]>(
        () => [{value: ALL, label: 'All devices'}, ...devices.map(device => ({value: device.id, label: device.name}))],
        [devices]
    );

    const virtualizer = useVirtualizer({
        count: shown.length,
        getScrollElement: () => scroller.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20
    });

    useEffect(() => {
        if (!paused && stuck && shown.length > 0) {
            virtualizer.scrollToIndex(shown.length - 1);
        }
    }, [shown.length, paused, stuck, virtualizer]);

    const onScroll = useCallback((): void => {
        const element = scroller.current;

        if (element !== null) {
            setStuck(element.scrollHeight - element.scrollTop - element.clientHeight < STICK);
        }
    }, []);

    const copy = (entries: readonly LogEntry[]): void => {
        void navigator.clipboard.writeText(asText(entries));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    const toggleGroup = (group: DebugGroup): void => {
        setGroups(current => (current.includes(group) ? current.filter(name => name !== group) : [...current, group]));
    };

    const toggleIn = (list: readonly number[], id: number): readonly number[] => (list.includes(id) ? list.filter(entry => entry !== id) : [...list, id]);

    const pick = (entry: LogEntry): void => {
        setSelected([entry.id]);
        setDetailId(entry.id);
        /* Picking pins the view: a line that arrives while an entry is open would otherwise scroll
           it out from under the pointer. */
        setStuck(false);
    };

    const step = (delta: -1 | 1): void => {
        const index = shown.findIndex(entry => entry.id === detailId);
        const next = shown[Math.min(shown.length - 1, Math.max(0, index + delta))];

        if (next !== undefined) {
            pick(next);
            virtualizer.scrollToIndex(shown.indexOf(next));
        }
    };

    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape' && detailId !== null) {
            event.preventDefault();
            setDetailId(null);
            return;
        }

        if (isTyping(event.target) || detailId === null) {
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            step(event.key === 'ArrowDown' ? 1 : -1);
        }
    };

    const chosen = useMemo(() => shown.filter(entry => selected.includes(entry.id)), [shown, selected]);

    return (
        <div className="flex h-full flex-col bg-surface outline-none" tabIndex={-1} onKeyDown={onKeyDown}>
            <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
                <Select label="Device" variant="ghost" size="sm" value={deviceId} items={deviceItems} onValueChange={setDeviceId}/>
                <span className={clsx(BTN_GROUP, 'ml-auto gap-1')}>
                    <Badge tone="muted">{shown.length}</Badge>
                    <IconButton
                        icon={Copy}
                        label={chosen.length > 0 ? `Copy ${chosen.length} selected` : 'Copy everything shown'}
                        size="sm"
                        onClick={() => copy(chosen.length > 0 ? chosen : shown)}
                    />
                    <IconButton icon={paused ? Play : Pause} label={paused ? 'Resume' : 'Pause'} size="sm" active={paused} onClick={() => setPaused(!paused)}/>
                    <IconButton
                        icon={Trash2}
                        label="Clear"
                        size="sm"
                        onClick={() => {
                            setSelected([]);
                            setDetailId(null);
                            void clear();
                        }}
                    />
                    <IconButton
                        icon={bottom ? PanelRight : PanelBottom}
                        label={bottom ? 'Dock to the right' : 'Dock to the bottom'}
                        size="sm"
                        onClick={() => setConsoleDock(bottom ? 'right' : 'bottom')}
                    />
                    <IconButton icon={X} label="Close console" size="sm" onClick={toggleConsole}/>
                </span>
            </header>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
                {DEBUG_GROUPS.map(group => (
                    <button
                        key={group}
                        type="button"
                        aria-pressed={groups.includes(group)}
                        onClick={() => toggleGroup(group)}
                        className={clsx(
                            'mono inline-flex h-6 cursor-default items-center gap-1 rounded-md px-1.5',
                            groups.includes(group) ? clsx('bg-surface-active', GROUP_COLOR[group]) : 'text-text-faint hover:bg-surface-hover'
                        )}
                    >
                        {group}
                        <span className="text-text-faint">{counts[group]}</span>
                    </button>
                ))}
            </div>
            <div className="shrink-0 border-b border-border p-2">
                <Field label="Filter log lines" placeholder="Filter" value={search} onChange={event => setSearch(event.target.value)} className="h-7"/>
            </div>
            {/* Beside the grid the entry goes under the list; under the grid the list has width to
                spare and the entry takes a column of its own. */}
            <div className={clsx('flex min-h-0 grow', bottom ? 'flex-row' : 'flex-col')}>
                <div className="relative min-h-0 min-w-0 grow">
                    <div ref={scroller} onScroll={onScroll} className="h-full overflow-auto bg-code-bg">
                        {shown.length === 0 ? (
                            <EmptyState>Nothing logged yet. Connect a device to see its protocol traffic.</EmptyState>
                        ) : (
                            <div className="relative w-full" style={{height: virtualizer.getTotalSize()}}>
                                {virtualizer.getVirtualItems().map(item => {
                                    const entry = shown[item.index]!;

                                    return (
                                        <div
                                            key={entry.id}
                                            data-index={item.index}
                                            className={clsx(
                                                'absolute top-0 left-0 flex w-full cursor-default gap-2 px-2 whitespace-pre',
                                                entry.id === detailId ? 'bg-surface-active' : selected.includes(entry.id) ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                                            )}
                                            style={{height: ROW_HEIGHT, transform: `translateY(${item.start}px)`}}
                                            onClick={event => {
                                                if (event.metaKey || event.ctrlKey) {
                                                    setSelected(current => toggleIn(current, entry.id));
                                                    return;
                                                }

                                                pick(entry);
                                            }}
                                        >
                                            <span className="mono shrink-0 text-code-dim">{formatTime(entry.timestamp)}</span>
                                            <span className={clsx('mono w-10 shrink-0', GROUP_COLOR[entry.group])}>{entry.group}</span>
                                            <span className="mono min-w-0 grow truncate text-code-fg" title={entry.message}>
                                                {entry.message}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {(waiting > 0 || !stuck) && (
                        <button
                            type="button"
                            className="absolute inset-x-0 bottom-2 mx-auto flex h-6 w-fit cursor-default items-center gap-1 rounded-full bg-accent px-2.5 text-xs text-accent-text shadow-float"
                            onClick={() => {
                                setPaused(false);
                                setStuck(true);
                            }}
                        >
                            {waiting > 0 ? `${waiting} new` : 'Jump to the end'}
                        </button>
                    )}
                </div>
                {detail !== null && (
                    <LogDetail
                        entry={detail}
                        deviceName={devices.find(device => device.id === detail.deviceId)?.name ?? null}
                        groupColor={GROUP_COLOR}
                        onClose={() => setDetailId(null)}
                        className={bottom ? 'w-[420px] shrink-0 border-l border-border' : 'h-2/5 shrink-0 border-t border-border'}
                    />
                )}
            </div>
        </div>
    );
}
