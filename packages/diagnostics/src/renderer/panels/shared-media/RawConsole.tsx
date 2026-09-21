import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Send, Trash2 } from 'lucide-react';
import { isCallFailure, type RawBuilderInfo, type RawTransport } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { invoke, messageOf } from '@/client';
import { useDevice } from '@/panels/hooks';
import { defaultArgs, RawForm } from '@/panels/shared-media/RawForm';
import { Badge, Button, EmptyState, Icon, IconButton, JsonView, Section, Select } from '@/ui';

/** Enough to compare a reply with the one before it without holding a session's worth of replies. */
const MAX_HISTORY = 50;

type HistoryEntry = {
    readonly id: number;
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

/**
 * Builder picker, generated form, send or exchange, reply. The catalog comes from main so the form
 * never has to know what a message looks like.
 */
export function RawConsole({deviceId, transport, emptyText}: RawConsoleProps) {
    const {connected} = useDevice(deviceId);
    const [catalog, setCatalog] = useState<readonly RawBuilderInfo[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [args, setArgs] = useState<Record<string, unknown>>({});
    const [exchange, setExchange] = useState(true);
    const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
    const [shown, setShown] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void invoke('raw:builders', undefined).then(
            entries => setCatalog(entries.filter(entry => entry.transport === transport)),
            () => setCatalog([])
        );
    }, [transport]);

    const builder = useMemo(() => catalog.find(entry => entry.id === selected) ?? catalog[0] ?? null, [catalog, selected]);

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
            const result = await invoke('raw:send', {deviceId, transport, id: builder.id, args, exchange: builder.supportsExchange && exchange});
            nextId += 1;

            const entry: HistoryEntry = {
                id: nextId,
                builder: builder.title,
                exchange: builder.supportsExchange && exchange,
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

    if (catalog.length === 0) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>{emptyText}</EmptyState>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0">
            <div className="flex min-h-0 w-1/2 shrink-0 flex-col gap-4 overflow-auto border-r border-border p-4">
                <Section title="Message" actions={builder && <Badge tone="muted">{builder.category}</Badge>}>
                    <Select<string> label="Message" value={builder?.id ?? null} onValueChange={setSelected} items={groups}/>
                    {builder && <p className="text-xs text-text-muted">{builder.description}</p>}
                </Section>

                <Section title="Arguments">{builder && <RawForm builder={builder} args={args} onArgsChange={setArgs} disabled={busy}/>}</Section>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={busy || !connected || builder === null} onClick={() => void send()}>
                        <Icon icon={Send} size={14}/>
                        {builder?.supportsExchange && exchange ? 'Exchange' : 'Send'}
                    </Button>
                    {builder?.supportsExchange && (
                        <Button variant={exchange ? 'secondary' : 'ghost'} size="sm" disabled={busy} onClick={() => setExchange(!exchange)}>
                            {exchange ? 'Waiting for a reply' : 'Fire and forget'}
                        </Button>
                    )}
                    {!connected && <span className="text-xs text-text-muted">Connect the device first.</span>}
                </div>

                {error && <p className="text-xs text-status-error">{error}</p>}
            </div>

            <div className="flex min-h-0 min-w-0 grow flex-col">
                <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
                    <span className="text-xs text-text-faint">History</span>
                    <Badge tone="muted">{history.length}</Badge>
                    <span className="ml-auto">
                        <IconButton icon={Trash2} label="Clear history" size="sm" disabled={history.length === 0} onClick={() => setHistory([])}/>
                    </span>
                </header>

                <div className="max-h-40 shrink-0 overflow-auto border-b border-border">
                    {history.length === 0 ? (
                        <EmptyState className="py-4">Nothing sent yet.</EmptyState>
                    ) : (
                        <table className="w-full table-fixed border-collapse">
                            <tbody>
                                {history.map(entry => (
                                    <tr
                                        key={entry.id}
                                        onClick={() => setShown(entry.id)}
                                        className={clsx('cursor-default border-b border-border-soft', entry.id === detail?.id ? 'bg-surface-active' : 'hover:bg-surface-hover')}
                                    >
                                        <td className="w-24 px-2 py-1 align-top">
                                            <span className="mono text-code-dim">{formatTime(entry.timestamp)}</span>
                                        </td>
                                        <td className="w-20 px-1 py-1 align-top">
                                            <Badge tone={entry.ok ? 'idle' : 'error'}>{entry.ok ? (entry.exchange ? 'reply' : 'sent') : 'failed'}</Badge>
                                        </td>
                                        <td className="truncate px-2 py-1 align-top text-xs">{entry.builder}</td>
                                        <td className="w-16 px-2 py-1 text-right align-top">
                                            <span className="mono text-xs tabular-nums text-text-muted">{entry.durationMs === null ? '-' : `${entry.durationMs}ms`}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="min-h-0 grow overflow-auto bg-code-bg p-2">{detail === null ? <EmptyState>The reply of the selected call shows up here.</EmptyState> : <JsonView value={detail.value} defaultDepth={3}/>}</div>
            </div>
        </div>
    );
}
