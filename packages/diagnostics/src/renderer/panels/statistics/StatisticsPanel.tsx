import { useEffect, useState } from 'react';
import { Chart, createChart } from '@adecore/charts';
import { formatBytes } from '@adecore/ui/format';
import type { TrafficProtocol } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { STATISTICS_INTERVAL_MS, STATISTICS_PROTOCOLS, STATISTICS_WINDOW_MS, type LogBucket, type MessageType, type StatisticsSnapshot, type TrafficBucket } from '@shared/statistics';
import { invoke, messageOf } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { CircleX, type LucideIcon } from 'lucide-react';
import { EmptyState, FormError, Icon, ICONS, PanelBody, Section } from '@/ui';

const PROTOCOL_LABELS: Record<TrafficProtocol, string> = {
    dataStream: 'Data stream',
    eventStream: 'Event stream',
    companionLink: 'Companion Link',
    rtsp: 'RTSP'
};

const TrafficChart = createChart<TrafficBucket>();
const LogChart = createChart<LogBucket>();
const TypeChart = createChart<MessageType>();

const formatTimeOfDay = (timestamp: string | number): string => formatTime(Number(timestamp)).slice(0, 8);

function useStatistics(deviceId: string | null) {
    const [result, setResult] = useState<{deviceId: string | null; snapshot: StatisticsSnapshot} | null>(null);
    const [failure, setFailure] = useState<{deviceId: string | null; message: string} | null>(null);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;

        const poll = async (): Promise<void> => {
            try {
                const snapshot = await invoke('statistics:history', {deviceId});

                if (active) {
                    setResult({deviceId, snapshot});
                    setFailure(null);
                }
            } catch (error) {
                if (active) {
                    setFailure({deviceId, message: messageOf(error)});
                }
            } finally {
                if (active) {
                    timer = setTimeout(() => void poll(), STATISTICS_INTERVAL_MS);
                }
            }
        };

        void poll();

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [deviceId]);

    return {
        snapshot: result?.deviceId === deviceId ? result.snapshot : null,
        error: failure?.deviceId === deviceId ? failure.message : null
    };
}

function Figure({icon, label, value}: { readonly icon: LucideIcon; readonly label: string; readonly value: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <Icon icon={icon} size={13}/>
                {label}
            </span>
            <span className="text-lg tabular-nums text-text">{value}</span>
        </div>
    );
}

export function StatisticsPanel({deviceId}: PanelProps) {
    const {snapshot, error} = useStatistics(deviceId);

    if (snapshot === null) {
        return (
            <div className="grid h-full place-items-center p-4">
                {error ? <FormError>{error}</FormError> : <EmptyState icon={ICONS.statistics} busy>Loading statistics.</EmptyState>}
            </div>
        );
    }

    const {start, messages, bytes, types, problems, totals} = snapshot;
    const xOptions = {min: start, max: start + STATISTICS_WINDOW_MS};

    return (
        <PanelBody>
            {error && <FormError>{error}</FormError>}
            <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-5">
                <Figure icon={ICONS.received} label="Received" value={String(totals.received)}/>
                <Figure icon={ICONS.sent} label="Sent" value={String(totals.sent)}/>
                <Figure icon={ICONS.traffic} label="Bytes" value={formatBytes(totals.bytes)}/>
                <Figure icon={ICONS.warning} label="Warnings" value={String(totals.warnings)}/>
                <Figure icon={CircleX} label="Errors" value={String(totals.errors)}/>
            </div>
            <p className="-mt-2 text-xs text-text-faint">Last 30 minutes, in two-second intervals. History builds while the app runs and survives clearing logs or traffic.</p>
            <Chart.Group className="flex flex-col gap-5">
                <Section title="Messages per two seconds" icon={ICONS.traffic} wide>
                    <TrafficChart.Root data={messages} x="at" xScale="time" step={STATISTICS_INTERVAL_MS} xOptions={xOptions} y={{integer: true}} label="Messages per two seconds, per protocol" height={180}>
                        <TrafficChart.Grid/>
                        <TrafficChart.XAxis format={formatTimeOfDay}/>
                        <TrafficChart.YAxis/>
                        {STATISTICS_PROTOCOLS.map(protocol => (
                            <TrafficChart.Area key={protocol} value={protocol} label={PROTOCOL_LABELS[protocol]} curve="monotone" stack/>
                        ))}
                        <TrafficChart.Tooltip total/>
                        <TrafficChart.Legend/>
                    </TrafficChart.Root>
                </Section>
                <Section title="Bytes per two seconds" icon={ICONS.statistics} wide>
                    <TrafficChart.Root data={bytes} x="at" xScale="time" step={STATISTICS_INTERVAL_MS} xOptions={xOptions} format={formatBytes} label="Bytes per two seconds, per protocol" height={180}>
                        <TrafficChart.Grid/>
                        <TrafficChart.XAxis format={formatTimeOfDay}/>
                        <TrafficChart.YAxis/>
                        {STATISTICS_PROTOCOLS.map(protocol => (
                            <TrafficChart.Area key={protocol} value={protocol} label={PROTOCOL_LABELS[protocol]} curve="monotone" stack/>
                        ))}
                        <TrafficChart.Tooltip total/>
                    </TrafficChart.Root>
                </Section>
                <Section title="Errors and warnings" icon={ICONS.warning} wide>
                    <LogChart.Root data={problems} x="at" xScale="time" step={STATISTICS_INTERVAL_MS} xOptions={xOptions} y={{integer: true}} label="Errors and warnings per two seconds" height={120}>
                        <LogChart.Grid/>
                        <LogChart.XAxis format={formatTimeOfDay}/>
                        <LogChart.YAxis ticks={3}/>
                        <LogChart.Bars stack>
                            <LogChart.Bar value="error" label="Errors" tone="error"/>
                            <LogChart.Bar value="warn" label="Warnings" tone="needsYou"/>
                        </LogChart.Bars>
                        <LogChart.Tooltip/>
                        <LogChart.Legend/>
                    </LogChart.Root>
                </Section>
            </Chart.Group>
            <Section title="Message types" icon={ICONS.raw} wide>
                <TypeChart.Root data={types} x="type" orientation="horizontal" rowHeight={24} y={{integer: true}} label="Most frequent message types in the last 30 minutes">
                    <TypeChart.Grid/>
                    <TypeChart.XAxis/>
                    <TypeChart.YAxis ticks={4}/>
                    <TypeChart.Bars stack>
                        <TypeChart.Bar value="in" label="Received"/>
                        <TypeChart.Bar value="out" label="Sent" valueLabels/>
                    </TypeChart.Bars>
                    <TypeChart.Tooltip total/>
                    <TypeChart.Legend/>
                </TypeChart.Root>
            </Section>
        </PanelBody>
    );
}
