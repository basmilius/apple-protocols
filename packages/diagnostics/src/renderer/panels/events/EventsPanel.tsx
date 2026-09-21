import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Pause, Play, Trash2 } from 'lucide-react';
import { DEVICE_EVENT_SOURCES, type DeviceEventSource } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { useDevices } from '@/state/devices';
import { useDeviceEvents } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { Badge, EmptyState, Field, IconButton, JsonView, Segmented } from '@/ui';

const SOURCE_TONE: Record<DeviceEventSource, 'muted' | 'accent' | 'idle' | 'running' | 'warning'> = {
    device: 'accent',
    state: 'idle',
    airplayState: 'running',
    dataStream: 'muted',
    eventStream: 'warning',
    companionLink: 'accent'
};

/*
 * Everything main forwards for this device, newest first, with the payload of the selected row
 * beside it. The second reference panel: it reads the event buffer and nothing else.
 */
export function EventsPanel({deviceId}: PanelProps) {
    const [source, setSource] = useState<DeviceEventSource | 'all'>('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<number | null>(null);
    const paused = useDevices(state => state.eventsPaused);
    const setPaused = useDevices(state => state.setEventsPaused);
    const clear = useDevices(state => state.clearEvents);

    const sources = useMemo(() => (source === 'all' ? undefined : [source]), [source]);
    const events = useDeviceEvents(deviceId, {sources});

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const matched = needle.length === 0 ? events : events.filter(event => event.name.toLowerCase().includes(needle));
        return [...matched].reverse();
    }, [events, search]);

    const detail = rows.find(event => event.sequence === selected) ?? rows[0] ?? null;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
                <Segmented<DeviceEventSource | 'all'>
                    label="Source"
                    value={source}
                    onValueChange={setSource}
                    items={[{value: 'all', label: 'All'}, ...DEVICE_EVENT_SOURCES.map(name => ({value: name, label: name}))]}
                />
                <Field label="Filter by name" placeholder="Filter" value={search} onChange={event => setSearch(event.target.value)} className="h-7 max-w-48"/>
                <span className="ml-auto flex items-center gap-1">
                    <Badge tone="muted">{rows.length}</Badge>
                    <IconButton icon={paused ? Play : Pause} label={paused ? 'Resume' : 'Pause'} size="sm" active={paused} onClick={() => setPaused(!paused)}/>
                    <IconButton icon={Trash2} label="Clear" size="sm" onClick={clear}/>
                </span>
            </header>
            <div className="flex min-h-0 grow">
                <div className="min-h-0 w-1/2 shrink-0 overflow-auto border-r border-border">
                    {rows.length === 0 ? (
                        <EmptyState>Nothing has come in yet. Connect the device, or clear the filter.</EmptyState>
                    ) : (
                        <table className="w-full table-fixed border-collapse">
                            <tbody>
                                {rows.map(event => (
                                    <tr
                                        key={event.sequence}
                                        onClick={() => setSelected(event.sequence)}
                                        className={clsx('cursor-default border-b border-border-soft', event.sequence === detail?.sequence ? 'bg-surface-active' : 'hover:bg-surface-hover')}
                                    >
                                        <td className="w-24 px-2 py-1 align-top">
                                            <span className="mono text-code-dim">{formatTime(event.timestamp)}</span>
                                        </td>
                                        <td className="w-28 px-1 py-1 align-top">
                                            <Badge tone={SOURCE_TONE[event.source]}>{event.source}</Badge>
                                        </td>
                                        <td className="truncate px-2 py-1 align-top text-xs">{event.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="min-h-0 min-w-0 grow overflow-auto bg-code-bg p-2">
                    {detail === null ? <EmptyState>Pick an event to see what it carried.</EmptyState> : <JsonView value={detail.payload} defaultDepth={3}/>}
                </div>
            </div>
        </div>
    );
}
