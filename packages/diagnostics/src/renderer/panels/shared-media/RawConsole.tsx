import { useEffect, useMemo, useState } from 'react';
import { isCallFailure, type RawBuilderInfo, type RawTransport } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { invoke, messageOf } from '@/client';
import { useDevice } from '@/panels/hooks';
import { defaultArgs, RawForm } from '@/panels/shared-media/RawForm';
import { Button, CopyButton, CountPill, EmptyState, FormError, Icon, IconButton, ICONS, JsonView, Pill, Section, Segmented, Select, StatusPill, Table } from '@/ui';

const MAX_HISTORY = 50;

const TRANSPORT_LABELS: Record<RawTransport, string> = {
    dataStream: 'Data stream',
    companionLink: 'Companion Link',
    controlStream: 'Control stream'
};

const COLUMNS = [{width: '5.5rem'}, {width: '4.5rem'}, {width: '7rem', hideBelow: 'lg'}, {width: 'minmax(0,1fr)'}, {width: '4rem', align: 'end'}] as const;

type HistoryEntry = {
    readonly id: number;
    readonly transport: RawTransport;
    readonly builder: string;
    readonly exchange: boolean;
    readonly ok: boolean;
    readonly durationMs: number | null;
    readonly value: unknown;
    readonly timestamp: number;
};

type RawConsoleProps = {
    readonly deviceId: string | null;
    readonly transport: RawTransport;
    readonly emptyText: string;
};

let nextId = 0;

/** Builds the form from main's catalog so the renderer needs no message-format definitions. History spans every transport. */
export function RawConsole({deviceId, transport, emptyText}: RawConsoleProps) {
    const {connected} = useDevice(deviceId);
    const [catalog, setCatalog] = useState<readonly RawBuilderInfo[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [args, setArgs] = useState<Record<string, unknown>>({});
    const [exchange, setExchange] = useState<'exchange' | 'send'>('exchange');
    const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
    const [shown, setShown] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setSelected(null);
        void invoke('raw:builders', undefined).then(
            entries => setCatalog(entries.filter(entry => entry.transport === transport)),
            () => setCatalog([])
        );
    }, [transport]);

    const builder = useMemo(() => catalog.find(entry => entry.id === selected) ?? catalog[0] ?? null, [catalog, selected]);
    const exchanging = builder?.supportsExchange === true && exchange === 'exchange';

    useEffect(() => {
        if (builder !== null) {
            setArgs(defaultArgs(builder));
        }
    }, [builder]);

    const groups = useMemo(() => {
        const byCategory = new Map<string, RawBuilderInfo[]>();

        for (const entry of catalog) {
            const bucket = byCategory.get(entry.category) ?? [];
            bucket.push(entry);
            byCategory.set(entry.category, bucket);
        }

        return Array.from(byCategory.entries()).map(([label, items]) => ({label, items: items.map(item => ({value: item.id, label: item.title, description: item.description}))}));
    }, [catalog]);

    const send = async (): Promise<void> => {
        if (deviceId === null || builder === null) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const result = await invoke('raw:send', {deviceId, transport, id: builder.id, args, exchange: exchanging});
            nextId += 1;

            const entry: HistoryEntry = {
                id: nextId,
                transport,
                builder: builder.title,
                exchange: exchanging,
                ok: !isCallFailure(result),
                durationMs: isCallFailure(result) ? null : result.durationMs,
                value: isCallFailure(result) ? result.error : result.value,
                timestamp: Date.now()
            };

            setHistory(previous => [entry, ...previous].slice(0, MAX_HISTORY));
            setShown(entry.id);
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    };

    const detail = history.find(entry => entry.id === shown) ?? history[0] ?? null;

    return (
        <div className="flex h-full min-h-0">
            <div className="@container flex min-h-0 w-1/2 shrink-0 flex-col gap-4 overflow-auto border-r border-border p-4">
                {catalog.length === 0 ? (
                    <EmptyState icon={ICONS.raw}>{emptyText}</EmptyState>
                ) : (
                    <>
                        <Section title="Message" icon={ICONS.send} actions={builder && <Pill tone="muted">{builder.category}</Pill>}>
                            <Select<string> label="Message" value={builder?.id ?? null} onValueChange={setSelected} items={groups}/>
                            {builder && <p className="text-xs text-text-muted">{builder.description}</p>}
                        </Section>

                        <Section title="Arguments" icon={ICONS.advanced}>
                            {builder && <RawForm builder={builder} args={args} onArgsChange={setArgs} disabled={busy}/>}
                        </Section>

                        <div className="flex flex-wrap items-center gap-2">
                            {builder?.supportsExchange && (
                                <Segmented<'exchange' | 'send'>
                                    label="Reply"
                                    value={exchange}
                                    onValueChange={setExchange}
                                    items={[
                                        {value: 'exchange', label: 'Wait for a reply', icon: ICONS.traffic},
                                        {value: 'send', label: 'Fire and forget', icon: ICONS.send}
                                    ]}
                                />
                            )}
                            <Button variant="primary" size="sm" disabled={busy || !connected || builder === null} onClick={() => void send()}>
                                <Icon icon={exchanging ? ICONS.traffic : ICONS.send} size={14}/>
                                {exchanging ? 'Exchange' : 'Send'}
                            </Button>
                            {!connected && <span className="text-xs text-text-muted">Connect the device first.</span>}
                        </div>

                        {error && <FormError>{error}</FormError>}
                    </>
                )}
            </div>

            <div className="flex min-h-0 min-w-0 grow flex-col">
                <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3">
                    <span className="text-xs text-text-muted">History</span>
                    <CountPill>{history.length}</CountPill>
                    <span className="ml-auto flex items-center">
                        {detail && <CopyButton text={JSON.stringify(detail.value, null, 4) ?? ''} label="Copy reply"/>}
                        <IconButton icon={ICONS.clear} label="Clear history" size="sm" disabled={history.length === 0} onClick={() => setHistory([])}/>
                    </span>
                </header>

                <div className="max-h-56 shrink-0 overflow-auto border-b border-border">
                    {history.length === 0 ? (
                        <EmptyState icon={ICONS.send}>Nothing sent yet.</EmptyState>
                    ) : (
                        <Table.Root label="History" columns={COLUMNS} density="compact">
                            {history.map(entry => (
                                <Table.Row key={entry.id} selected={entry.id === detail?.id} onClick={() => setShown(entry.id)}>
                                    <Table.Cell mono>{formatTime(entry.timestamp)}</Table.Cell>
                                    <Table.Cell>
                                        <StatusPill status={entry.ok ? 'ok' : 'error'}>{entry.ok ? (entry.exchange ? 'reply' : 'sent') : 'failed'}</StatusPill>
                                    </Table.Cell>
                                    <Table.Cell>{TRANSPORT_LABELS[entry.transport]}</Table.Cell>
                                    <Table.Cell>{entry.builder}</Table.Cell>
                                    <Table.Cell mono>{entry.durationMs === null ? '-' : `${entry.durationMs}ms`}</Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Root>
                    )}
                </div>

                <div className="min-h-0 grow overflow-auto bg-code-bg p-3">
                    {detail === null ? <EmptyState icon={ICONS.result}>The reply of the selected call shows up here.</EmptyState> : <JsonView value={detail.value} defaultDepth={3}/>}
                </div>
            </div>
        </div>
    );
}
