import { SkipBack, SkipForward } from 'lucide-react';
import type { StateSnapshot } from '@shared/contract';
import { formatDuration, formatTime } from '@shared/helpers';
import { DeviceIcon } from '@/shell/DeviceIcon';
import { Button, ButtonGroup, CopyButton, EmptyState, Icon, IconButton, ICONS, KeyValue, KeyValueList, Meter, PanelBody, Section, StatusBar, StatusPill, Tooltip } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall, useLogs, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { MissingDevice, PanelLink, VolumeControls, VolumeModePill } from '@/panels/sdk-shared';

function MiniPlayer({snapshot, connected, call}: { readonly snapshot: StateSnapshot | null; readonly connected: boolean; readonly call: DeviceCall }) {
    const nowPlaying = snapshot?.nowPlaying ?? null;
    const elapsed = usePlayhead(nowPlaying, snapshot?.updatedAt);

    if (nowPlaying === null || (nowPlaying.title === '' && nowPlaying.appName === null)) {
        return <EmptyState icon={ICONS.nowPlaying}>Nothing is playing on this device.</EmptyState>;
    }

    const meta = [nowPlaying.artist, nowPlaying.album].filter(part => (part ?? '') !== '').join(' • ');

    return (
        <div className="flex items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-sunken">
                {nowPlaying.artworkUrl ? <img src={nowPlaying.artworkUrl} alt="" className="size-full object-cover"/> : <Icon icon={ICONS.nowPlaying} size={20} className="text-text-faint"/>}
            </div>
            <div className="flex min-w-0 grow flex-col gap-1.5">
                <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{nowPlaying.title || nowPlaying.appName}</span>
                    <span className="truncate text-xs text-text-muted">{meta || (nowPlaying.appName ?? '-')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-2xs tabular-nums text-text-faint">{formatDuration(elapsed)}</span>
                    <Meter label="Position" value={nowPlaying.duration > 0 ? elapsed : null} max={Math.max(1, nowPlaying.duration)} valueText={`${formatDuration(elapsed)} of ${formatDuration(nowPlaying.duration)}`} className="grow"/>
                    <span className="w-10 shrink-0 text-2xs tabular-nums text-text-faint">{formatDuration(nowPlaying.duration)}</span>
                </div>
            </div>
            <ButtonGroup className="shrink-0">
                <IconButton icon={SkipBack} label="Previous" disabled={!connected} onClick={() => void call('device', 'playback.previous')}/>
                <Tooltip label="Play or pause">
                    <Button variant="primary" aria-label="Play or pause" disabled={!connected} onClick={() => void call('device', 'playback.playPause')}>
                        <Icon icon={ICONS.playPause} size={16}/>
                    </Button>
                </Tooltip>
                <IconButton icon={SkipForward} label="Next" disabled={!connected} onClick={() => void call('device', 'playback.next')}/>
            </ButtonGroup>
        </div>
    );
}

export function OverviewPanel({deviceId}: PanelProps) {
    const {device, snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const problems = useLogs({groups: ['error'], deviceIds: deviceId === null ? [] : [deviceId], limit: 3});

    if (device === null) {
        return <MissingDevice/>;
    }

    const connection = snapshot?.connection ?? null;
    const volume = snapshot?.volume ?? null;
    const paired = (protocol: 'airplay' | 'companionLink'): string => (device.paired.includes(protocol) ? 'paired' : 'not paired');

    return (
        <PanelBody>
            <StatusBar>
                <span className="flex items-center gap-1.5 text-text">
                    <DeviceIcon device={device} size={14}/>
                    {device.modelName || device.deviceType}
                </span>
                {device.services.airplay && (
                    <StatusPill status={connection?.airplay.connected ? 'ok' : 'off'} icon={ICONS.airplay}>
                        {`AirPlay, ${paired('airplay')}`}
                    </StatusPill>
                )}
                {device.services.companionLink && (
                    <StatusPill status={connection?.companionLink.connected ? 'ok' : 'off'} icon={ICONS.companionLink}>
                        {`Companion Link, ${paired('companionLink')}`}
                    </StatusPill>
                )}
            </StatusBar>

            <Section title="Now playing" icon={ICONS.nowPlaying} actions={<><PanelLink panel="nowplaying" label="Now playing"/><PanelLink panel="playback" label="Playback"/></>}>
                <MiniPlayer snapshot={snapshot} connected={connected} call={call}/>
            </Section>

            <Section title="Volume" icon={ICONS.volume} actions={<>{connected && <VolumeModePill control={volume?.control ?? 'none'}/>}<PanelLink panel="volume" label="Volume"/></>}>
                <VolumeControls volume={volume} connected={connected} call={call}/>
            </Section>

            <Section title="Device" icon={ICONS.info}>
                <KeyValueList>
                    <KeyValue label="Identifier" icon={ICONS.identifier}>
                        <span className="inline-flex items-center gap-1">
                            {device.id}
                            <CopyButton text={device.id} label="Copy identifier" size="sm"/>
                        </span>
                    </KeyValue>
                    <KeyValue label="Address" icon={ICONS.address}>{device.address}</KeyValue>
                    <KeyValue label="Model" icon={ICONS.model}>{device.modelName || 'Unknown'}</KeyValue>
                    <KeyValue label="Type" icon={ICONS.model}>{device.deviceType}</KeyValue>
                    {device.services.airplay && <KeyValue label="AirPlay port" icon={ICONS.port}>{device.services.airplay.port}</KeyValue>}
                    {device.services.companionLink && <KeyValue label="Companion port" icon={ICONS.port}>{device.services.companionLink.port}</KeyValue>}
                </KeyValueList>
            </Section>

            <Section title="Recent errors" icon={ICONS.warning}>
                {connection?.error && <p className="text-xs text-status-error">{connection.error}</p>}
                {problems.length === 0 && !connection?.error ? (
                    <p className="text-xs text-text-muted">No errors logged for this device.</p>
                ) : (
                    <KeyValueList>
                        {[...problems].reverse().map(entry => (
                            <KeyValue key={entry.id} label={formatTime(entry.timestamp)} mono={false}>
                                {entry.message}
                            </KeyValue>
                        ))}
                    </KeyValueList>
                )}
            </Section>
        </PanelBody>
    );
}
