import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import type { TrafficProtocol, TrafficRecord } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { useDevices } from '@/state/devices';
import type { PanelProps } from '@/panels/registry';
import { CopyButton, CountPill, DetailPane, EmptyState, Icon, IconButton, ICONS, JsonView, MasterDetail, Pill, Segmented, Select, type SelectItem, Table, TextInput } from '@/ui';

type Direction = 'all' | 'in' | 'out';

const PROTOCOL_ITEMS: readonly SelectItem<TrafficProtocol | 'all'>[] = [
    {value: 'all', label: 'All protocols'},
    {value: 'dataStream', label: 'Data stream'},
    {value: 'eventStream', label: 'Event stream'},
    {value: 'companionLink', label: 'Companion Link'},
    {value: 'rtsp', label: 'RTSP'}
];

const COLUMNS = [{width: '5.5rem'}, {width: '1rem'}, {width: '7.5rem', hideBelow: 'md'}, {width: 'minmax(0,1fr)'}] as const;

export function TrafficPanel({deviceId}: PanelProps) {
    const live = useDevices(state => state.traffic);
    const clearTraffic = useDevices(state => state.clearTraffic);
    const [frozen, setFrozen] = useState<readonly TrafficRecord[] | null>(null);
    const [protocol, setProtocol] = useState<TrafficProtocol | 'all'>('all');
    const [direction, setDirection] = useState<Direction>('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<number | null>(null);
    const records = frozen ?? live;

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return records
            .filter(record => record.deviceId === deviceId)
            .filter(record => protocol === 'all' || record.protocol === protocol)
            .filter(record => direction === 'all' || record.direction === direction)
            .filter(record => needle.length === 0 || record.summary.toLowerCase().includes(needle))
            .reverse();
    }, [records, deviceId, protocol, direction, search]);

    const detail = rows.find(record => record.id === selected) ?? rows[0] ?? null;

    return (
        <MasterDetail
            toolbar={
                <>
                    <Select<TrafficProtocol | 'all'> label="Protocol" size="sm" value={protocol} onValueChange={setProtocol} items={PROTOCOL_ITEMS}/>
                    <Segmented<Direction>
                        label="Direction"
                        value={direction}
                        onValueChange={setDirection}
                        items={[
                            {value: 'all', label: 'Both', icon: ArrowLeftRight},
                            {value: 'in', label: 'Received', icon: ArrowDownLeft},
                            {value: 'out', label: 'Sent', icon: ArrowUpRight}
                        ]}
                    />
                    <TextInput label="Filter by summary" placeholder="Filter" value={search} onChange={event => setSearch(event.target.value)} className="h-7 max-w-48"/>
                    <span className="ml-auto flex items-center gap-1">
                        <CountPill>{rows.length}</CountPill>
                        <IconButton icon={frozen ? Play : Pause} label={frozen ? 'Resume' : 'Pause'} size="sm" active={frozen !== null} onClick={() => setFrozen(frozen ? null : live)}/>
                        <IconButton icon={ICONS.clear} label="Clear the traffic of all devices" size="sm" onClick={() => void clearTraffic()}/>
                    </span>
                </>
            }
            list={
                rows.length === 0 ? (
                    <EmptyState icon={ICONS.traffic}>No traffic yet. Connect the device, or clear the filter.</EmptyState>
                ) : (
                    <Table.Root label="Traffic" columns={COLUMNS} density="compact">
                        <Table.Head>
                            <Table.Column>Time</Table.Column>
                            <Table.Column/>
                            <Table.Column>Protocol</Table.Column>
                            <Table.Column>Summary</Table.Column>
                        </Table.Head>
                        {rows.map(record => (
                            <Table.Row key={record.id} selected={record.id === detail?.id} onClick={() => setSelected(record.id)}>
                                <Table.Cell mono>{formatTime(record.timestamp)}</Table.Cell>
                                <Table.Cell>
                                    <Icon icon={record.direction === 'out' ? ArrowUpRight : ArrowDownLeft} size={14} className={record.direction === 'out' ? 'text-accent' : 'text-status-idle'}/>
                                </Table.Cell>
                                <Table.Cell>{PROTOCOL_ITEMS.find(item => item.value === record.protocol)?.label ?? record.protocol}</Table.Cell>
                                <Table.Cell>{record.summary}</Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Root>
                )
            }
            detail={
                detail === null ? (
                    <EmptyState icon={ICONS.result}>Pick a message to see what it carried.</EmptyState>
                ) : (
                    <DetailPane
                        title={detail.summary}
                        actions={
                            <>
                                {detail.size !== null && <Pill tone="muted" mono>{`${detail.size} B`}</Pill>}
                                <CopyButton text={JSON.stringify({decoded: detail.decoded, size: detail.size, bytes: detail.bytes}, null, 4)} label="Copy message"/>
                            </>
                        }
                    >
                        <JsonView value={{decoded: detail.decoded, size: detail.size, bytes: detail.bytes}} defaultDepth={3}/>
                    </DetailPane>
                )
            }
        />
    );
}
