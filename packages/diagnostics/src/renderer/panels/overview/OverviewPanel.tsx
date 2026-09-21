import { useState } from 'react';
import { Music, Plug, PlugZap } from 'lucide-react';
import { formatDuration } from '@shared/helpers';
import { Badge, Button, CommandButton, EmptyState, Icon, KeyValue, KeyValueList, PanelBody, Section, Slider } from '@/ui';
import type { VolumeSnapshot } from '@shared/contract';
import { type DeviceCall, useDevice, useDeviceCall, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';

/* The slider follows the pointer on its own and only tells the device where it landed: a set on
   every frame would flood a connection that answers one command at a time. */
function VolumeControl({volume, connected, call}: { readonly volume: VolumeSnapshot | null; readonly connected: boolean; readonly call: DeviceCall }) {
    const [dragging, setDragging] = useState<number | null>(null);
    const level = dragging ?? volume?.level ?? 0;

    return (
        <div className="flex items-center gap-3">
            <Slider
                label="Volume"
                value={level}
                disabled={!connected || volume?.available !== true}
                onValueChange={setDragging}
                onValueCommitted={next => {
                    setDragging(null);
                    void call('device', 'volume.set', [next / 100]);
                }}
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{level}%</span>
        </div>
    );
}

/*
 * The panel every other one is written against: it reads the snapshot for what it shows and goes
 * through `device:call` for everything it does.
 */
export function OverviewPanel({deviceId}: PanelProps) {
    const {device, snapshot, connected, busy, connect, disconnect} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    if (device === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>This device is not in the last scan. Rescan to bring it back.</EmptyState>
            </div>
        );
    }

    const connection = snapshot?.connection ?? null;
    const nowPlaying = snapshot?.nowPlaying ?? null;
    const elapsed = usePlayhead(nowPlaying, snapshot?.updatedAt);
    const volume = snapshot?.volume ?? null;

    return (
        <PanelBody>
            <Section
                title="Connection"
                actions={
                    connected ? (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void disconnect()}>
                            <Icon icon={Plug} size={14}/>
                            Disconnect
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" disabled={busy} onClick={() => void connect()}>
                            <Icon icon={PlugZap} size={14}/>
                            Connect
                        </Button>
                    )
                }
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={connected ? 'idle' : 'muted'}>{connection?.status ?? 'disconnected'}</Badge>
                    <Badge tone={connection?.airplay.connected ? 'idle' : 'muted'}>AirPlay</Badge>
                    {connection?.companionLink.available && <Badge tone={connection.companionLink.connected ? 'idle' : 'muted'}>Companion Link</Badge>}
                    {device.paired.map(protocol => (
                        <Badge key={protocol} tone="accent">
                            paired: {protocol}
                        </Badge>
                    ))}
                </div>
                {connection?.error && <p className="text-xs text-status-error">{connection.error}</p>}
            </Section>

            <Section title="Device">
                <KeyValueList>
                    <KeyValue label="Name">{device.name}</KeyValue>
                    <KeyValue label="Identifier">{device.id}</KeyValue>
                    <KeyValue label="Address">{device.address}</KeyValue>
                    <KeyValue label="Model">{device.modelName || 'Unknown'}</KeyValue>
                    <KeyValue label="Type">{device.deviceType}</KeyValue>
                    {device.services.airplay && <KeyValue label="AirPlay port">{device.services.airplay.port}</KeyValue>}
                    {device.services.companionLink && <KeyValue label="Companion port">{device.services.companionLink.port}</KeyValue>}
                </KeyValueList>
            </Section>

            <Section title="Now playing">
                {nowPlaying === null || (nowPlaying.title === '' && nowPlaying.appName === null) ? (
                    <EmptyState icon={<Icon icon={Music} size={18}/>} className="py-4">
                        Nothing is playing on this device.
                    </EmptyState>
                ) : (
                    <div className="flex gap-4">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
                            {nowPlaying.artworkUrl && <img src={nowPlaying.artworkUrl} alt="" className="h-full w-full object-cover"/>}
                        </div>
                        <div className="min-w-0 grow">
                            <KeyValueList>
                                <KeyValue label="Title" mono={false}>
                                    {nowPlaying.title || '-'}
                                </KeyValue>
                                <KeyValue label="Artist" mono={false}>
                                    {nowPlaying.artist || '-'}
                                </KeyValue>
                                <KeyValue label="Album" mono={false}>
                                    {nowPlaying.album || '-'}
                                </KeyValue>
                                <KeyValue label="State">{nowPlaying.playbackState}</KeyValue>
                                <KeyValue label="Position">
                                    {formatDuration(elapsed)} / {formatDuration(nowPlaying.duration)}
                                </KeyValue>
                                <KeyValue label="App">{nowPlaying.bundleIdentifier ?? '-'}</KeyValue>
                            </KeyValueList>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <CommandButton label="Play" run={() => call('device', 'playback.play')} disabled={!connected}/>
                    <CommandButton label="Pause" run={() => call('device', 'playback.pause')} disabled={!connected}/>
                    <CommandButton label="Next" run={() => call('device', 'playback.next')} disabled={!connected}/>
                    <CommandButton label="Previous" run={() => call('device', 'playback.previous')} disabled={!connected}/>
                </div>
            </Section>

            <Section title="Volume" actions={<Badge tone={volume?.available ? 'idle' : 'muted'}>{volume?.available ? 'available' : 'unavailable'}</Badge>}>
                <VolumeControl volume={volume} connected={connected} call={call}/>
                <div className="flex flex-wrap items-center gap-2">
                    <CommandButton label="Volume up" run={() => call('device', 'volume.up')} disabled={!connected}/>
                    <CommandButton label="Volume down" run={() => call('device', 'volume.down')} disabled={!connected}/>
                    <CommandButton label="Toggle mute" run={() => call('device', 'volume.mute')} disabled={!connected}/>
                </div>
            </Section>
        </PanelBody>
    );
}
