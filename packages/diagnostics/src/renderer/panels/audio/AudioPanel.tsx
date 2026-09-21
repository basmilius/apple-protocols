import { useState } from 'react';
import { Play, Radio, Square } from 'lucide-react';
import type { AudioSourceSpec, AudioStatus } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { useStatus } from '@/panels/shared-media/hooks';
import { DEFAULT_SOURCE, SourcePicker } from '@/panels/shared-media/SourcePicker';
import { Sparkline, StatGrid } from '@/panels/shared-media/Telemetry';
import { Badge, Button, EmptyState, Field, Icon, KeyValue, KeyValueList, Section, Slider, Tabs, TabPanel, Toggle } from '@/ui';

/**
 * Playing a URL and streaming PCM are two different things and get two tabs. The device fetches a
 * URL itself; a stream is RTP packets we send, which is the only mode with telemetry.
 */
export function AudioPanel({deviceId}: PanelProps) {
    const {device, connected} = useDevice(deviceId);
    const [status] = useStatus('audio:status', 'audio:status', deviceId);
    const [tab, setTab] = useState('stream');
    const [url, setUrl] = useState('');
    const [position, setPosition] = useState(0);
    const [source, setSource] = useState<AudioSourceSpec>(DEFAULT_SOURCE);
    const [volumeDb, setVolumeDb] = useState(-20);
    const [ptp, setPtp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (device === null || deviceId === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>This device is not in the last scan. Rescan to bring it back.</EmptyState>
            </div>
        );
    }

    const current: AudioStatus | null = status;
    const playing = current?.playing === true;
    const mode = current?.mode ?? 'idle';

    const run = async (action: () => Promise<unknown>): Promise<void> => {
        setBusy(true);
        setError(null);

        try {
            await action();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
                <Badge tone={playing ? 'running' : 'muted'}>{mode}</Badge>
                {current?.ptpExperiment && <Badge tone="warning">PTP experiment</Badge>}
                <span className="ml-auto truncate text-xs text-text-muted">{current?.source ?? 'nothing loaded'}</span>
            </header>

            <div className="min-h-0 grow overflow-auto">
                <Tabs
                    value={tab}
                    onValueChange={setTab}
                    label="Audio mode"
                    items={[
                        {value: 'stream', label: 'Stream PCM'},
                        {value: 'url', label: 'Play URL'}
                    ]}
                >
                    <TabPanel value="stream" className="flex flex-col gap-5 p-4">
                        <Section title="Source">
                            <SourcePicker value={source} onValueChange={setSource} disabled={playing}/>
                        </Section>

                        <Section title="Volume" actions={<span className="mono text-xs tabular-nums text-text-muted">{volumeDb} dB</span>}>
                            <Slider label="Stream volume in dB" value={volumeDb} min={-60} max={0} step={1} disabled={playing} onValueChange={setVolumeDb}/>
                            <p className="text-xs text-text-muted">A fresh audio session starts silent, so the stream sets this before the first packet. -144 mutes, 0 is the loudest.</p>
                        </Section>

                        <Section title="Timing" actions={<Badge tone={ptp ? 'warning' : 'idle'}>{ptp ? 'PTP' : 'NTP'}</Badge>}>
                            <Toggle label="Run the PTP experiment" checked={ptp} disabled={playing} onCheckedChange={setPtp}/>
                            <p className="text-xs text-text-muted">
                                NTP through the shared timing server is the proven path. PTP makes this stream run over its own protocol with a grandmaster of our own, which is known to yield silent playback on PTP-capable
                                receivers. Experimental.
                            </p>
                        </Section>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="primary" size="sm" disabled={!connected || playing || busy} onClick={() => void run(() => invoke('audio:stream', {deviceId, source, volumeDb, ptpExperiment: ptp}))}>
                                <Icon icon={Radio} size={14}/>
                                Start stream
                            </Button>
                            <Button variant="secondary" size="sm" disabled={!playing || mode !== 'stream' || busy} onClick={() => void run(() => invoke('audio:stopStream', {deviceId}))}>
                                <Icon icon={Square} size={14}/>
                                Stop stream
                            </Button>
                        </div>

                        <Telemetry status={current}/>
                    </TabPanel>

                    <TabPanel value="url" className="flex flex-col gap-5 p-4">
                        <Section title="Media URL">
                            <Field label="URL" placeholder="https://example.com/video.mp4" value={url} disabled={playing} onChange={event => setUrl(event.target.value)} mono/>
                            <Field label="Start position (s)" type="number" value={position} disabled={playing} onChange={event => setPosition(Number(event.target.value))} mono/>
                            <p className="text-xs text-text-muted">The device fetches this itself over a session of its own. Nothing is sent from here beyond the URL.</p>
                        </Section>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="primary" size="sm" disabled={!connected || playing || busy || url.trim().length === 0} onClick={() => void run(() => invoke('audio:playUrl', {deviceId, url: url.trim(), position}))}>
                                <Icon icon={Play} size={14}/>
                                Play URL
                            </Button>
                            <Button variant="secondary" size="sm" disabled={!playing || mode !== 'url' || busy} onClick={() => void run(() => invoke('audio:stopUrl', {deviceId}))}>
                                <Icon icon={Square} size={14}/>
                                Stop
                            </Button>
                            <Button variant="ghost" size="sm" disabled={!playing || mode !== 'url' || busy} onClick={() => void run(() => invoke('audio:waitForEnd', {deviceId}))}>
                                Wait for end
                            </Button>
                        </div>

                        <Section title="Session">
                            <KeyValueList>
                                <KeyValue label="Mode">{mode}</KeyValue>
                                <KeyValue label="Source">{current?.source ?? '-'}</KeyValue>
                                <KeyValue label="Started">{current?.startedAt === null || current?.startedAt === undefined ? '-' : new Date(current.startedAt).toLocaleTimeString()}</KeyValue>
                            </KeyValueList>
                        </Section>
                    </TabPanel>
                </Tabs>
            </div>

            {(error ?? current?.error) && <footer className="shrink-0 border-t border-border px-3 py-2 text-xs text-status-error">{error ?? current?.error}</footer>}
        </div>
    );
}

/** Live counters off the audio stream, pushed four times a second while a stream runs. */
function Telemetry({status}: { readonly status: AudioStatus | null }) {
    const telemetry = status?.telemetry ?? null;

    if (telemetry === null) {
        return (
            <Section title="Telemetry">
                <p className="text-xs text-text-muted">Counters appear once a stream is running and the receiver has negotiated the audio session.</p>
            </Section>
        );
    }

    return (
        <Section title="Telemetry">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Sparkline label="Packets sent" value={telemetry.packetsSent}/>
                <Sparkline label="Bytes sent" value={telemetry.totalBytesSent} format={value => `${(value / 1024).toFixed(0)} KiB`}/>
                <Sparkline label="Retransmit requests" value={telemetry.retransmitRequests}/>
            </div>
            <StatGrid
                entries={[
                    ['Retransmits fulfilled', String(telemetry.retransmitsFulfilled)],
                    ['Retransmits failed', String(telemetry.retransmitsFailed)],
                    ['Packet loss rate', `${(telemetry.packetLossRate * 100).toFixed(2)}%`]
                ]}
            />
            {telemetry.ptp !== null && (
                <StatGrid
                    entries={[
                        ['PTP state', telemetry.ptp.state],
                        ['Clock identity', telemetry.ptp.clockIdentity],
                        ['Event port', String(telemetry.ptp.eventPort)],
                        ['General port', String(telemetry.ptp.generalPort)],
                        ['Syncs sent', String(telemetry.ptp.syncsSent)],
                        ['Announces sent', String(telemetry.ptp.announcesSent)],
                        ['Announces received', String(telemetry.ptp.announcesReceived)],
                        ['DelayReq received', String(telemetry.ptp.delayReqsReceived)],
                        ['DelayResp sent', String(telemetry.ptp.delayRespsSent)]
                    ]}
                />
            )}
        </Section>
    );
}
