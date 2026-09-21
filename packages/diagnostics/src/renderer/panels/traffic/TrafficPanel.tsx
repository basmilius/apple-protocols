import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';
import type { TrafficProtocol, TrafficRecord } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { invoke, on } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { Badge, EmptyState, Field, IconButton, JsonView, Segmented } from '@/ui';

const PROTOCOLS: readonly TrafficProtocol[] = ['dataStream', 'eventStream', 'companionLink', 'rtsp'];

/** Main keeps 5000; a panel that renders every row does not need to hold more than it can show. */
const CAPACITY = 1000;

export function TrafficPanel({deviceId}: PanelProps) {
    const [records, setRecords] = useState<readonly TrafficRecord[]>([]);
    const [protocol, setProtocol] = useState<TrafficProtocol | 'all'>('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<number | null>(null);

    useEffect(() => {
        void invoke('traffic:history', undefined).then(history => setRecords(history.slice(-CAPACITY)));

        return on('traffic:entry', record => setRecords(current => [...current, record].slice(-CAPACITY)));
    }, []);

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return records
            .filter(record => record.deviceId === deviceId)
            .filter(record => protocol === 'all' || record.protocol === protocol)
            .filter(record => needle.length === 0 || record.summary.toLowerCase().includes(needle))
            .reverse();
    }, [records, deviceId, protocol, search]);

    const detail = rows.find(record => record.id === selected) ?? rows[0] ?? null;

    function clear() {
        void invoke('traffic:clear', undefined);
        setRecords([]);
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
                <Segmented<TrafficProtocol | 'all'>
                    label="Protocol"
                    value={protocol}
                    onValueChange={setProtocol}
                    items={[{value: 'all', label: 'All'}, ...PROTOCOLS.map(name => ({value: name, label: name}))]}
                />
                <Field label="Filter by summary" placeholder="Filter" value={search} onChange={event => setSearch(event.target.value)} className="h-7 max-w-48"/>
                <span className="ml-auto flex items-center gap-1">
                    <Badge tone="muted">{rows.length}</Badge>
                    <IconButton icon={Trash2} label="Clear" size="sm" onClick={clear}/>
                </span>
            </header>
            <div className="flex min-h-0 grow">
                <div className="min-h-0 w-1/2 shrink-0 overflow-auto border-r border-border">
                    {rows.length === 0 ? (
                        <EmptyState>No traffic yet. Connect the device, or clear the filter.</EmptyState>
                    ) : (
                        <table className="w-full table-fixed border-collapse">
                            <tbody>
                                {rows.map(record => {
                                    const Direction = record.direction === 'out' ? ArrowUpRight : ArrowDownLeft;

                                    return (
                                        <tr
                                            key={record.id}
                                            onClick={() => setSelected(record.id)}
                                            className={clsx('cursor-default border-b border-border-soft', record.id === detail?.id ? 'bg-surface-active' : 'hover:bg-surface-hover')}
                                        >
                                            <td className="w-24 px-2 py-1 align-top">
                                                <span className="mono text-code-dim">{formatTime(record.timestamp)}</span>
                                            </td>
                                            <td className="w-6 py-1 align-top">
                                                <Direction size={14} aria-label={record.direction}/>
                                            </td>
                                            <td className="w-28 px-1 py-1 align-top">
                                                <Badge tone={record.direction === 'out' ? 'accent' : 'idle'}>{record.protocol}</Badge>
                                            </td>
                                            <td className="truncate px-2 py-1 align-top text-xs">{record.summary}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="min-h-0 min-w-0 grow overflow-auto bg-code-bg p-2">
                    {detail === null ? <EmptyState>Pick a message to see what it carried.</EmptyState> : <JsonView value={{decoded: detail.decoded, size: detail.size, bytes: detail.bytes}} defaultDepth={3}/>}
                </div>
            </div>
        </div>
    );
}
