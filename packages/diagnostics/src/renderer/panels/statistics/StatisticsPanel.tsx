import { useEffect, useMemo, useState } from 'react';
import { Chart, createChart } from '@adecore/charts';
import { formatBytes } from '@adecore/ui/format';
import type { TrafficProtocol } from '@shared/contract';
import { useDevices } from '@/state/devices';
import type { PanelProps } from '@/panels/registry';
import { CircleX, type LucideIcon } from 'lucide-react';
import { Icon, ICONS, PanelBody, Section } from '@/ui';
import { BUCKET_MS, logBuckets, type LogBucket, type MessageType, PROTOCOLS, topTypes, type TrafficBucket, trafficBuckets, WINDOW_MS, windowStart } from './buckets';

const PROTOCOL_LABELS: Record<TrafficProtocol, string> = {
    dataStream: 'Data stream',
    eventStream: 'Event stream',
    companionLink: 'Companion Link',
    rtsp: 'RTSP'
};

const TYPE_LIMIT = 12;

const TrafficChart = createChart<TrafficBucket>();
const LogChart = createChart<LogBucket>();
const TypeChart = createChart<MessageType>();

/* The window slides with the clock, also while the device is silent. */
function useWindowStart(): number {
    const [start, setStart] = useState(() => windowStart(Date.now()));

    useEffect(() => {
        const timer = window.setInterval(() => setStart(windowStart(Date.now())), 1000);

        return () => window.clearInterval(timer);
    }, []);

    return start;
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
    const traffic = useDevices(state => state.traffic);
    const logs = useDevices(state => state.logs);
    const start = useWindowStart();
    const xOptions = {min: start, max: start + WINDOW_MS};

    const records = useMemo(() => traffic.filter(record => record.deviceId === deviceId), [traffic, deviceId]);
    const messages = useMemo(() => trafficBuckets(records, start, () => 1), [records, start]);
    const bytes = useMemo(() => trafficBuckets(records, start, record => record.size ?? 0), [records, start]);
    const types = useMemo(() => topTypes(records, start, TYPE_LIMIT), [records, start]);
    const problems = useMemo(() => logBuckets(logs.filter(entry => entry.deviceId === deviceId), start), [logs, deviceId, start]);

    const totals = useMemo(() => {
        const recent = records.filter(record => record.timestamp >= start);
        const recentLogs = logs.filter(entry => entry.deviceId === deviceId && entry.timestamp >= start);

        return {
            received: recent.filter(record => record.direction === 'in').length,
            sent: recent.filter(record => record.direction === 'out').length,
            bytes: recent.reduce((sum, record) => sum + (record.size ?? 0), 0),
            errors: recentLogs.filter(entry => entry.group === 'error').length,
            warnings: recentLogs.filter(entry => entry.group === 'warn').length
        };
    }, [records, logs, deviceId, start]);

    return (
        <PanelBody>
            <div className="grid grid-cols-2 gap-2 @[640px]:grid-cols-5">
                <Figure icon={ICONS.received} label="Received" value={String(totals.received)}/>
                <Figure icon={ICONS.sent} label="Sent" value={String(totals.sent)}/>
                <Figure icon={ICONS.traffic} label="Bytes" value={formatBytes(totals.bytes)}/>
                <Figure icon={ICONS.warning} label="Warnings" value={String(totals.warnings)}/>
                <Figure icon={CircleX} label="Errors" value={String(totals.errors)}/>
            </div>
            <p className="-mt-2 text-xs text-text-faint">Totals over the last five minutes, the window the charts show.</p>
            <Chart.Group className="flex flex-col gap-5">
                <Section title="Messages per five seconds" icon={ICONS.traffic} wide>
                    <TrafficChart.Root data={messages} x="at" xScale="time" step={BUCKET_MS} xOptions={xOptions} y={{integer: true}} label="Messages per five seconds, per protocol" height={180}>
                        <TrafficChart.Grid/>
                        <TrafficChart.XAxis/>
                        <TrafficChart.YAxis/>
                        {PROTOCOLS.map(protocol => (
                            <TrafficChart.Area key={protocol} value={protocol} label={PROTOCOL_LABELS[protocol]} curve="monotone" stack/>
                        ))}
                        <TrafficChart.Tooltip total/>
                        <TrafficChart.Legend/>
                    </TrafficChart.Root>
                </Section>
                <Section title="Bytes per five seconds" icon={ICONS.statistics} wide>
                    <TrafficChart.Root data={bytes} x="at" xScale="time" step={BUCKET_MS} xOptions={xOptions} format={formatBytes} label="Bytes per five seconds, per protocol" height={180}>
                        <TrafficChart.Grid/>
                        <TrafficChart.XAxis/>
                        <TrafficChart.YAxis/>
                        {PROTOCOLS.map(protocol => (
                            <TrafficChart.Area key={protocol} value={protocol} label={PROTOCOL_LABELS[protocol]} curve="monotone" stack/>
                        ))}
                        <TrafficChart.Tooltip total/>
                    </TrafficChart.Root>
                </Section>
                <Section title="Errors and warnings" icon={ICONS.warning} wide>
                    <LogChart.Root data={problems} x="at" xScale="time" step={BUCKET_MS} xOptions={xOptions} y={{integer: true}} label="Errors and warnings per five seconds" height={120}>
                        <LogChart.Grid/>
                        <LogChart.XAxis/>
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
                <TypeChart.Root data={types} x="type" orientation="horizontal" rowHeight={24} y={{integer: true}} label="Most frequent message types in the last five minutes">
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
