import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatBytes } from '@adecore/ui/format';
import type { PerformanceStatus } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { EmptyState, FormError, IconButton, ICONS, KeyValue, KeyValueList, Meter, PanelBody, RelativeTime, Section, StatusBar } from '@/ui';
import { Sparkline } from '../shared-media/Telemetry';

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

                if (active) {
                    setStatus(next);
                    setError(null);
                }
            } catch (failure) {
                if (active) {
                    setError(messageOf(failure));
                }
            } finally {
                if (active) {
                    timer = setTimeout(() => void poll(), 1000);
                }
            }
        };

        void poll();

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, []);

    if (status === null) {
        return (
            <div className="grid h-full place-items-center p-4">
                {error ? <FormError>{error}</FormError> : <EmptyState icon={ICONS.performance} busy>Waiting for the first sample.</EmptyState>}
            </div>
        );
    }

    return (
        <PanelBody>
            <StatusBar banner={error && <FormError>{error}</FormError>}>
                <span>
                    Sampled <RelativeTime at={status.sampledAt}/>, every second with 10 ms timer resolution.
                </span>
            </StatusBar>

            <Section title="Event loop" icon={ICONS.eventLoop} actions={<IconButton icon={RotateCcw} label="Reset the peak" size="sm" onClick={() => void invoke('performance:reset', undefined).then(setStatus)}/>}>
                <Sparkline label="Delay p99" value={status.eventLoop.p99Ms} format={ms}/>
                <KeyValueList>
                    <KeyValue label="Delay p95">{ms(status.eventLoop.p95Ms)}</KeyValue>
                    <KeyValue label="Delay p99">{ms(status.eventLoop.p99Ms)}</KeyValue>
                    <KeyValue label="Maximum">{ms(status.eventLoop.maxMs)}</KeyValue>
                    <KeyValue label="Peak since reset">{ms(status.eventLoop.peakMs)}</KeyValue>
                    <KeyValue label="Utilization">
                        <span className="flex items-center gap-2">
                            <Meter label="Event loop utilization" value={status.eventLoop.utilization * 100} valueText={`${(status.eventLoop.utilization * 100).toFixed(1)}%`} className="w-24"/>
                            {`${(status.eventLoop.utilization * 100).toFixed(1)}%`}
                        </span>
                    </KeyValue>
                </KeyValueList>
            </Section>

            <Section title="Memory" icon={ICONS.memory}>
                <Sparkline label="RSS" value={status.memory.rss} format={formatBytes}/>
                <KeyValueList>
                    <KeyValue label="Heap used">{formatBytes(status.memory.heapUsed)}</KeyValue>
                    <KeyValue label="External">{formatBytes(status.memory.external)}</KeyValue>
                    <KeyValue label="Array buffers">{formatBytes(status.memory.arrayBuffers)}</KeyValue>
                </KeyValueList>
                <p className="text-xs text-text-muted">RSS includes workers and native decoder memory.</p>
            </Section>

            <Section title="Capture retention" icon={ICONS.storage}>
                <KeyValueList>
                    {Object.entries(status.retention).map(([name, stats]) => (
                        <KeyValue key={name} label={name} mono={false}>
                            <span className="flex flex-col gap-1">
                                <Meter label={`${name} retention`} value={stats.retainedBytes} max={Math.max(1, stats.byteLimit)} valueText={`${formatBytes(stats.retainedBytes)} of ${formatBytes(stats.byteLimit)}`}/>
                                <span className="text-text-muted">{`${formatBytes(stats.retainedBytes)} of ${formatBytes(stats.byteLimit)}, ${stats.entries} entries, ${stats.dropped} evicted`}</span>
                            </span>
                        </KeyValue>
                    ))}
                </KeyValueList>
                <p className="text-xs text-text-muted">Older entries are evicted at the byte or entry limit. Binary previews keep their original length and mark the cut.</p>
            </Section>
        </PanelBody>
    );
}
