import { useEffect, useState } from 'react';
import type { PerformanceStatus } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { Badge, CommandButton, EmptyState, KeyValue, PanelBody, Section } from '@/ui';
import { Sparkline, StatGrid } from '../shared-media/Telemetry';

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const ms = (value: number): string => `${value.toFixed(1)} ms`;

export function PerformancePanel() {
    const [status, setStatus] = useState<PerformanceStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async (): Promise<void> => {
            try {
                const next = await invoke('performance:status', undefined);
                if (active) {setStatus(next); setError(null);}
            } catch (failure) {
                if (active) setError(messageOf(failure));
            } finally {
                if (active) timer = setTimeout(() => void poll(), 1000);
            }
        };
        void poll();
        return () => {active = false; clearTimeout(timer);};
    }, []);
    return (
        <PanelBody>
            <Section title="Main process" actions={<CommandButton label="Reset peak" run={async () => {setStatus(await invoke('performance:reset', undefined));}}/>}>
                {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
                {status === null ? <EmptyState>Waiting for the first sample…</EmptyState> : <>
                    <div className="grid grid-cols-2 gap-2">
                        <Sparkline label="Event loop p99" value={status.eventLoop.p99Ms} format={ms}/>
                        <Sparkline label="RSS" value={status.memory.rss} format={mb}/>
                    </div>
                    <StatGrid entries={[
                        ['Delay p95', ms(status.eventLoop.p95Ms)], ['Delay p99', ms(status.eventLoop.p99Ms)],
                        ['Maximum', ms(status.eventLoop.maxMs)], ['Peak since reset', ms(status.eventLoop.peakMs)],
                        ['Utilization', `${(status.eventLoop.utilization * 100).toFixed(1)}%`], ['Heap used', mb(status.memory.heapUsed)],
                        ['External', mb(status.memory.external)], ['Array buffers', mb(status.memory.arrayBuffers)]
                    ]}/>
                    <p className="text-xs text-text-muted">One-second samples with 10 ms timer resolution. RSS includes workers and native decoder memory.</p>
                    <KeyValue label="Sampled at">{new Date(status.sampledAt).toLocaleTimeString()}</KeyValue>
                </>}
            </Section>
            <Section title="Capture retention" actions={<Badge tone="muted">Serialized bytes</Badge>}>
                {status && Object.entries(status.retention).map(([name, stats]) => <div key={name} className="rounded-lg border border-border bg-surface-sunken p-3">
                    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm text-text">{name}</span><span className="mono text-xs tabular-nums text-text-muted">{stats.entries} entries</span></div>
                    <KeyValue label="Retained / limit">{mb(stats.retainedBytes)} / {mb(stats.byteLimit)}</KeyValue>
                    <KeyValue label="Evicted / oversized">{stats.dropped}</KeyValue>
                </div>)}
                <p className="text-xs text-text-muted">Older entries are evicted at the byte or entry limit. Binary previews retain their original length and mark truncation.</p>
            </Section>
        </PanelBody>
    );
}
