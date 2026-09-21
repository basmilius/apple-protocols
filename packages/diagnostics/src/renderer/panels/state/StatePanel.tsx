import { useMemo, useState } from 'react';
import { formatDuration, formatTime } from '@shared/helpers';
import type { ClientSnapshot, PlayerSnapshot } from '@shared/contract';
import { Badge, CommandButton, EmptyState, JsonView, KeyValue, KeyValueList, Section } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall, useDeviceEvents, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { NotConnected, PanelBody, ResultBlock, Row } from '@/panels/sdk-shared';

/* The `StateController` getters worth reading in one go; the ones that answer with a protocol
   object get their own button, because their payload is a tree rather than a line. */
const SCALAR_GETTERS: readonly string[] = [
    'title',
    'artist',
    'album',
    'genre',
    'duration',
    'elapsedTime',
    'playbackRate',
    'isPlaying',
    'playbackState',
    'mediaType',
    'shuffleMode',
    'repeatMode',
    'volume',
    'isMuted',
    'volumeAvailable',
    'isKeyboardActive',
    'clusterId',
    'isClusterLeader'
];

function PlayerBlock({player, updatedAt}: { readonly player: PlayerSnapshot; readonly updatedAt: number | undefined }) {
    const elapsed = usePlayhead(player, updatedAt);

    return (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-text">{player.displayName || player.identifier || 'Unnamed player'}</span>
                {player.isActive && <Badge tone="accent">active</Badge>}
                {player.isDefaultPlayer && <Badge tone="muted">default</Badge>}
                <Badge tone="muted">{player.playbackState}</Badge>
            </div>
            <KeyValueList>
                <KeyValue label="Identifier">{player.identifier || '-'}</KeyValue>
                <KeyValue label="Title" mono={false}>
                    {player.title || '-'}
                </KeyValue>
                <KeyValue label="Artist" mono={false}>
                    {player.artist || '-'}
                </KeyValue>
                <KeyValue label="Album" mono={false}>
                    {player.album || '-'}
                </KeyValue>
                <KeyValue label="Genre" mono={false}>
                    {player.genre || '-'}
                </KeyValue>
                <KeyValue label="Series" mono={false}>
                    {player.seriesName || '-'}
                </KeyValue>
                <KeyValue label="Season / episode">
                    {player.seasonNumber} / {player.episodeNumber}
                </KeyValue>
                <KeyValue label="Media type">{player.mediaType}</KeyValue>
                <KeyValue label="Content identifier">{player.contentIdentifier || '-'}</KeyValue>
                <KeyValue label="Shuffle / repeat">
                    {player.shuffleMode} / {player.repeatMode}
                </KeyValue>
                <KeyValue label="Rate">{player.playbackRate}</KeyValue>
                <KeyValue label="Position">
                    {formatDuration(elapsed)} / {formatDuration(player.duration)}
                </KeyValue>
            </KeyValueList>
            <div className="flex flex-wrap gap-1">
                {player.supportedCommands.length === 0 ? (
                    <span className="text-xs text-text-muted">No supported commands reported.</span>
                ) : (
                    player.supportedCommands.map(command => (
                        <Badge key={command} tone="muted" mono>
                            {command}
                        </Badge>
                    ))
                )}
            </div>
        </div>
    );
}

function ClientBlock({client, updatedAt}: { readonly client: ClientSnapshot; readonly updatedAt: number | undefined }) {
    return (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-text">{client.displayName || client.bundleIdentifier}</span>
                <Badge tone="muted" mono>
                    {client.bundleIdentifier}
                </Badge>
                {client.isActive && <Badge tone="accent">active</Badge>}
                <Badge tone="muted">{client.playbackState}</Badge>
                <Badge tone="muted">{`${client.players.length} players`}</Badge>
            </div>
            <div className="flex flex-col gap-2">
                {client.players.map(player => (
                    <PlayerBlock key={`${client.bundleIdentifier}:${player.identifier}`} player={player} updatedAt={updatedAt}/>
                ))}
            </div>
        </div>
    );
}

/* One button that walks the scalar getters, so reading the controller does not mean pressing
   eighteen buttons. A getter that throws shows its reason in place of a value. */
function GetterTable({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [values, setValues] = useState<readonly { readonly name: string; readonly text: string }[]>([]);

    const readAll = async (): Promise<unknown> => {
        const results = await Promise.all(
            SCALAR_GETTERS.map(async name => {
                try {
                    return {name, text: JSON.stringify(await call('device', `state.${name}`)) ?? 'undefined'};
                } catch (error) {
                    return {name, text: error instanceof Error ? error.message : String(error)};
                }
            })
        );

        setValues(results);

        return results.length;
    };

    return (
        <div className="flex flex-col gap-2">
            <Row>
                <CommandButton label="Read getters" run={readAll} disabled={!connected}/>
                <ResultBlock label="state.activeApp" run={() => call('device', 'state.activeApp')} disabled={!connected}/>
                <ResultBlock label="state.outputDevices" run={() => call('device', 'state.outputDevices')} disabled={!connected}/>
            </Row>
            {values.length > 0 && (
                <KeyValueList>
                    {values.map(entry => (
                        <KeyValue key={entry.name} label={entry.name}>
                            {entry.text}
                        </KeyValue>
                    ))}
                </KeyValueList>
            )}
        </div>
    );
}

export function StatePanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const events = useDeviceEvents(deviceId, {sources: ['state'], limit: 200});
    const clients = snapshot?.clients ?? [];
    const capabilities = snapshot?.device?.capabilities ?? null;
    const receiverInfo = snapshot?.device?.receiverInfo ?? null;

    const feed = useMemo(() => [...events].reverse(), [events]);

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section wide title="Clients" actions={<Badge tone="muted">{clients.length}</Badge>}>
                {clients.length === 0 ? (
                    <EmptyState className="py-4">No media client has registered with this device.</EmptyState>
                ) : (
                    <div className="flex flex-col gap-2">
                        {clients.map(client => (
                            <ClientBlock key={client.bundleIdentifier} client={client} updatedAt={snapshot?.updatedAt}/>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="StateController">
                <GetterTable call={call} connected={connected}/>
            </Section>

            <Section title="Capabilities">
                {capabilities === null ? (
                    <p className="text-xs text-text-muted">The snapshot carries no capabilities yet.</p>
                ) : (
                    <KeyValueList>
                        {Object.entries(capabilities).map(([name, value]) => (
                            <KeyValue key={name} label={name}>
                                {String(value)}
                            </KeyValue>
                        ))}
                    </KeyValueList>
                )}
                {receiverInfo !== null && (
                    <div className="max-h-56 overflow-auto rounded-lg border border-border bg-code-bg p-2">
                        <JsonView value={receiverInfo} defaultDepth={2}/>
                    </div>
                )}
                <Row>
                    <ResultBlock label="device.capabilities" run={() => call('device', 'capabilities')} disabled={!connected}/>
                    <ResultBlock label="device.receiverInfo" run={() => call('device', 'receiverInfo')} disabled={!connected}/>
                    <ResultBlock label="receiverFeatures" run={() => call('airplayProtocol', 'receiverFeatures')} disabled={!connected}/>
                </Row>
            </Section>

            <Section wide title="State events" actions={<Badge tone="muted">{feed.length}</Badge>}>
                <div className="max-h-72 overflow-auto rounded-lg border border-border bg-code-bg p-2">
                    {feed.length === 0 ? (
                        <p className="text-xs text-text-muted">The state controller has not emitted anything yet.</p>
                    ) : (
                        feed.map(event => (
                            <div key={event.sequence} className="border-b border-border-soft py-1 last:border-b-0">
                                <div className="flex items-center gap-2">
                                    <span className="mono text-code-dim">{formatTime(event.timestamp)}</span>
                                    <span className="text-xs text-text">{event.name}</span>
                                </div>
                                <JsonView value={event.payload} defaultDepth={1}/>
                            </div>
                        ))
                    )}
                </div>
            </Section>
        </PanelBody>
    );
}
