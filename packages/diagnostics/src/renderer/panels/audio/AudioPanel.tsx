import { useState } from 'react';
import { Hourglass, Play, Square } from 'lucide-react';
import { formatBytes } from '@adecore/ui/format';
import type { AudioSourceSpec, AudioStatus } from '@shared/contract';
import { invoke } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { MissingDevice, NotConnected } from '@/panels/sdk-shared';
import { useStatus } from '@/panels/shared-media/hooks';
import { DEFAULT_SOURCE, SourcePicker } from '@/panels/shared-media/SourcePicker';
import { Sparkline, StatGrid } from '@/panels/shared-media/Telemetry';
import { Banner, Button, Field, Icon, ICONS, KeyValue, KeyValueList, Meter, MiddleTruncate, PanelBody, RelativeTime, Section, Segmented, Slider, StatusBar, StatusPill, TextInput, Toggle, useAsyncAction } from '@/ui';

type Mode = 'stream' | 'url';

/** The device fetches URLs itself. PCM streaming sends RTP packets and supplies telemetry. */
export function AudioPanel({deviceId}: PanelProps) {
    const {device, connected} = useDevice(deviceId);
    const [status] = useStatus('audio:status', 'audio:status', deviceId);
    const [mode, setMode] = useState<Mode>('stream');
    const [url, setUrl] = useState('');
    const [position, setPosition] = useState(0);
    const [source, setSource] = useState<AudioSourceSpec>(DEFAULT_SOURCE);
    const [volumeDb, setVolumeDb] = useState(-20);
    const [ptp, setPtp] = useState(false);
    const action = useAsyncAction();

    if (device === null || deviceId === null) {
        return <MissingDevice/>;
    }

    const current: AudioStatus | null = status;
    const playing = current?.playing === true;
    const running = current?.mode ?? 'idle';
    const failure = action.failure ?? current?.error ?? null;

    return (
        <PanelBody>
            <StatusBar banner={!connected ? <NotConnected/> : failure && <Banner placement="inline" tone="error" icon={ICONS.warning} message={failure}/>}>
                <StatusPill status={playing ? 'busy' : 'off'} icon={playing ? ICONS.audio : undefined}>{running}</StatusPill>
                {current?.ptpExperiment && <StatusPill status="warning">PTP experiment</StatusPill>}
                {current?.source && <MiddleTruncate text={current.source} className="min-w-0 max-w-96"/>}
                {current?.startedAt != null && (
                    <span className="flex items-center gap-1">
                        started <RelativeTime at={current.startedAt}/>
                    </span>
                )}
            </StatusBar>

            <div className="col-span-full">
                <Segmented<Mode>
                    label="Audio mode"
                    value={mode}
                    onValueChange={setMode}
                    items={[
                        {value: 'stream', label: 'PCM stream', icon: ICONS.audio},
                        {value: 'url', label: 'Media URL', icon: ICONS.app}
                    ]}
                />
            </div>

            {mode === 'stream' ? (
                <>
                    <Section title="Source" icon={ICONS.source}>
                        <SourcePicker value={source} onValueChange={setSource} disabled={playing}/>
                    </Section>

                    <Section title="Volume and timing" icon={ICONS.volume} actions={<span className="mono text-xs tabular-nums text-text-muted">{volumeDb} dB</span>}>
                        <Slider label="Stream volume in dB" value={volumeDb} min={-60} max={0} step={1} disabled={playing} onValueChange={setVolumeDb}/>
                        <p className="text-xs text-text-muted">A fresh audio session starts silent, so the stream sets this before the first packet. -144 mutes, 0 is the loudest.</p>
                        <div className="flex items-center gap-2">
                            <Icon icon={ICONS.timing} size={14} className="text-text-faint"/>
                            <Toggle label="Run the PTP experiment" checked={ptp} disabled={playing} onCheckedChange={setPtp}/>
                            <StatusPill status={ptp ? 'warning' : 'ok'}>{ptp ? 'PTP' : 'NTP'}</StatusPill>
                        </div>
                        <p className="text-xs text-text-muted">NTP through the shared timing server is the proven path. PTP runs this stream with a grandmaster of our own, which is known to yield silent playback on PTP-capable receivers.</p>
                    </Section>

                    <div className="col-span-full flex flex-wrap items-center gap-2">
                        <Button variant="primary" size="sm" disabled={!connected || playing || action.busy} onClick={() => void action.run(() => invoke('audio:stream', {deviceId, source, volumeDb, ptpExperiment: ptp}))}>
                            <Icon icon={ICONS.audio} size={14}/>
                            Start stream
                        </Button>
                        <Button variant="secondary" size="sm" disabled={!playing || running !== 'stream' || action.busy} onClick={() => void action.run(() => invoke('audio:stopStream', {deviceId}))}>
                            <Icon icon={Square} size={14}/>
                            Stop stream
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <Section title="Media URL" icon={ICONS.app}>
                        <Field label="URL" hint="The device fetches this itself over a session of its own. Nothing is sent from here beyond the URL.">
                            <TextInput label="URL" placeholder="https://example.com/video.mp4" value={url} disabled={playing} onChange={event => setUrl(event.target.value)} mono/>
                        </Field>
                        <Field label="Start position (s)">
                            <TextInput label="Start position (s)" type="number" value={position} disabled={playing} onChange={event => setPosition(Number(event.target.value))} className="w-28" mono/>
                        </Field>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="primary" size="sm" disabled={!connected || playing || action.busy || url.trim().length === 0} onClick={() => void action.run(() => invoke('audio:playUrl', {deviceId, url: url.trim(), position}))}>
                                <Icon icon={Play} size={14}/>
                                Play URL
                            </Button>
                            <Button variant="secondary" size="sm" disabled={!playing || running !== 'url' || action.busy} onClick={() => void action.run(() => invoke('audio:stopUrl', {deviceId}))}>
                                <Icon icon={Square} size={14}/>
                                Stop
                            </Button>
                            <Button variant="ghost" size="sm" disabled={!playing || running !== 'url' || action.busy} onClick={() => void action.run(() => invoke('audio:waitForEnd', {deviceId}))}>
                                <Icon icon={Hourglass} size={14}/>
                                Wait for end
                            </Button>
                        </div>
                    </Section>
                </>
            )}

            {/* Rendered outside the mode switch so the sparkline history survives it. */}
            <Telemetry status={current}/>
        </PanelBody>
    );
}

function Telemetry({status}: { readonly status: AudioStatus | null }) {
    const telemetry = status?.telemetry ?? null;

    if (telemetry === null) {
        return (
            <Section wide title="Telemetry" icon={ICONS.telemetry}>
                <p className="text-xs text-text-muted">Counters appear once a PCM stream runs and the receiver has negotiated the audio session.</p>
            </Section>
        );
    }

    const buffer = telemetry.sourceBuffer;

    return (
        <Section wide title="Telemetry" icon={ICONS.telemetry}>
            <div className="grid grid-cols-1 gap-2 @[560px]:grid-cols-3">
                <Sparkline label="Packets sent" value={telemetry.packetsSent}/>
                <Sparkline label="Bytes sent" value={telemetry.totalBytesSent} format={formatBytes}/>
                <Sparkline label="Retransmit requests" value={telemetry.retransmitRequests}/>
            </div>
            <KeyValueList>
                <KeyValue label="Packet loss">
                    <span className="flex items-center gap-2">
                        <Meter label="Packet loss rate" value={telemetry.packetLossRate * 100} max={5} valueText={`${(telemetry.packetLossRate * 100).toFixed(2)}%`} className="w-32"/>
                        {`${(telemetry.packetLossRate * 100).toFixed(2)}%`}
                    </span>
                </KeyValue>
                <KeyValue label="Retransmits">{`${telemetry.retransmitsFulfilled} fulfilled, ${telemetry.retransmitsFailed} failed`}</KeyValue>
                {buffer && (
                    <KeyValue label="Source buffer">
                        <span className="flex flex-wrap items-center gap-2">
                            <Meter
                                label="Source buffer"
                                value={buffer.bufferedBytes}
                                max={Math.max(buffer.bufferLimit, buffer.peakBufferedBytes, 1)}
                                marks={[buffer.bufferLimit]}
                                valueText={formatBytes(buffer.bufferedBytes)}
                                className="w-32"
                            />
                            {`${formatBytes(buffer.bufferedBytes)}, peak ${formatBytes(buffer.peakBufferedBytes)}, pause at ${formatBytes(buffer.bufferLimit)}`}
                            <StatusPill status={buffer.paused ? 'warning' : 'ok'}>{buffer.paused ? 'producer paused' : 'producer running'}</StatusPill>
                        </span>
                    </KeyValue>
                )}
            </KeyValueList>
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
