import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { DEVICE_EVENT_SOURCES, type DeviceEventSource } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { useDeviceEvents } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { CopyButton, CountPill, DetailPane, EmptyState, Icon, IconButton, ICONS, JsonView, MasterDetail, Pill, Select, type SelectItem, Table, TextInput } from '@/ui';

const SOURCE_ITEMS: readonly SelectItem<DeviceEventSource | 'all'>[] = [{value: 'all', label: 'All sources'}, ...DEVICE_EVENT_SOURCES.map(name => ({value: name, label: name}))];

const SOURCE_TONE: Record<DeviceEventSource, 'muted' | 'accent' | 'idle' | 'needsYou'> = {
    device: 'accent',
    state: 'idle',
    airplayState: 'idle',
    dataStream: 'muted',
    eventStream: 'needsYou',
    companionLink: 'accent'
};

const COLUMNS = [{width: '5.5rem'}, {width: '8rem', hideBelow: 'md'}, {width: 'minmax(0,1fr)'}] as const;

export function EventsPanel({deviceId}: PanelProps) {
    const handed = useLayout(state => state.eventsFilter);
    const clearHanded = useLayout(state => state.clearEventsFilter);
    const [source, setSource] = useState<DeviceEventSource | 'all'>('all');
    const [names, setNames] = useState<readonly string[] | undefined>(undefined);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<number | null>(null);
    const paused = useDevices(state => state.eventsPaused);
    const setPaused = useDevices(state => state.setEventsPaused);
    const clear = useDevices(state => state.clearEvents);

    /* A page that hands over its feed sets the filter once; after that the filter is the user's own. */
    useEffect(() => {
        if (handed === null) {
            return;
        }

        setSource(handed.sources?.length === 1 ? handed.sources[0] : 'all');
        setNames(handed.names);
        setSelected(null);
        clearHanded();
    }, [handed, clearHanded]);

    const sources = useMemo(() => (source === 'all' ? undefined : [source]), [source]);
    const events = useDeviceEvents(deviceId, {sources, names});

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const matched = needle.length === 0 ? events : events.filter(event => event.name.toLowerCase().includes(needle));

        return [...matched].reverse();
    }, [events, search]);

    const detail = rows.find(event => event.sequence === selected) ?? rows[0] ?? null;

    return (
        <MasterDetail
            toolbar={
                <>
                    <Select<DeviceEventSource | 'all'> label="Source" size="sm" value={source} onValueChange={setSource} items={SOURCE_ITEMS}/>
                    <TextInput label="Filter by name" placeholder="Filter" value={search} onChange={event => setSearch(event.target.value)} className="h-7 max-w-48"/>
                    {names && (
                        <Pill tone="accent" icon={<Icon icon={X} size={12}/>} onClick={() => setNames(undefined)}>
                            {names.join(', ')}
                        </Pill>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                        <CountPill>{rows.length}</CountPill>
                        <IconButton icon={paused ? Play : Pause} label={paused ? 'Resume' : 'Pause'} size="sm" active={paused} onClick={() => setPaused(!paused)}/>
                        <IconButton icon={ICONS.clear} label="Clear the events of all devices" size="sm" onClick={clear}/>
                    </span>
                </>
            }
            list={
                rows.length === 0 ? (
                    <EmptyState icon={ICONS.events}>Nothing has come in yet. Connect the device, or clear the filter.</EmptyState>
                ) : (
                    <Table.Root label="Events" columns={COLUMNS} density="compact">
                        <Table.Head>
                            <Table.Column>Time</Table.Column>
                            <Table.Column>Source</Table.Column>
                            <Table.Column>Name</Table.Column>
                        </Table.Head>
                        {rows.map(event => (
                            <Table.Row key={event.sequence} selected={event.sequence === detail?.sequence} onClick={() => setSelected(event.sequence)}>
                                <Table.Cell mono>{formatTime(event.timestamp)}</Table.Cell>
                                <Table.Cell>
                                    <Pill tone={SOURCE_TONE[event.source]}>{event.source}</Pill>
                                </Table.Cell>
                                <Table.Cell>{event.name}</Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Root>
                )
            }
            detail={
                detail === null ? (
                    <EmptyState icon={ICONS.result}>Pick an event to see what it carried.</EmptyState>
                ) : (
                    <DetailPane title={`${detail.source} / ${detail.name}`} actions={<CopyButton text={JSON.stringify(detail.payload, null, 4)} label="Copy payload"/>}>
                        <JsonView value={detail.payload} defaultDepth={3}/>
                    </DetailPane>
                )
            }
        />
    );
}
