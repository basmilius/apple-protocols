import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { ListRow, ScrollArea } from '@adecore/ui';
import type { ClientSnapshot, PlayerSnapshot, StateSnapshot } from '@shared/contract';
import { formatDuration } from '@shared/helpers';
import { type DeviceCall, useDevice, useDeviceCall, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { EventFeed, NotConnected, PanelBody, ResultBlock, Row } from '@/panels/sdk-shared';
import { BoolValue, CommandButton, CountPill, EmptyState, Icon, ICONS, JsonView, KeyValue, KeyValueList, Pill, Section, StatusPill, Table } from '@/ui';

type Getter = {
    /* A path under the device. */
    readonly name: string;
    /* What the snapshot says, for comparison. Absent for values that move on their own or use another unit. */
    readonly snapshot?: (snapshot: StateSnapshot | null) => unknown;
};

const activePlayer = (snapshot: StateSnapshot | null): PlayerSnapshot | null => snapshot?.clients.flatMap(client => client.players).find(player => player.isActive) ?? null;

/* The model reports Unknown where the device API reports 'off'. */
const modeOf = (mode: string | undefined): string | undefined => (mode === undefined ? undefined : mode === 'Unknown' ? 'off' : mode.toLowerCase());

const GETTERS: readonly Getter[] = [
    {name: 'nowPlaying.current.title', snapshot: snapshot => snapshot?.nowPlaying?.title},
    {name: 'nowPlaying.current.artist', snapshot: snapshot => snapshot?.nowPlaying?.artist},
    {name: 'nowPlaying.current.album', snapshot: snapshot => snapshot?.nowPlaying?.album},
    {name: 'nowPlaying.current.genre', snapshot: snapshot => snapshot?.nowPlaying?.genre},
    {name: 'nowPlaying.current.duration', snapshot: snapshot => snapshot?.nowPlaying?.duration},
    {name: 'nowPlaying.elapsed'},
    {name: 'nowPlaying.current.rate', snapshot: snapshot => snapshot?.nowPlaying?.playbackRate},
    {name: 'nowPlaying.current.state', snapshot: snapshot => snapshot?.nowPlaying?.playbackState?.toLowerCase()},
    {name: 'nowPlaying.current.kind', snapshot: snapshot => snapshot?.nowPlaying?.mediaType?.toLowerCase()},
    {name: 'nowPlaying.current.shuffle', snapshot: snapshot => modeOf(activePlayer(snapshot)?.shuffleMode)},
    {name: 'nowPlaying.current.repeat', snapshot: snapshot => modeOf(activePlayer(snapshot)?.repeatMode)},
    {name: 'volume.level'},
    {name: 'volume.muted', snapshot: snapshot => snapshot?.volume?.muted},
    {name: 'volume.available', snapshot: snapshot => snapshot?.volume?.available},
    {name: 'volume.mode'},
    {name: 'text.state.active', snapshot: snapshot => snapshot?.keyboard?.active},
    {name: 'multiroom.clusterId', snapshot: snapshot => snapshot?.cluster?.clusterId},
    {name: 'multiroom.isLeader', snapshot: snapshot => snapshot?.cluster?.isLeader}
];

const STATE_SOURCE = ['state'] as const;
const COLUMNS = [{width: 'minmax(0,1fr)'}, {width: 'minmax(0,1.2fr)'}, {width: 'minmax(0,1.2fr)'}, {width: '1.5rem'}] as const;

const show = (value: unknown): string => (value === undefined ? '-' : (JSON.stringify(value) ?? 'undefined'));

function PlayerRow({player, updatedAt}: { readonly player: PlayerSnapshot; readonly updatedAt: number | undefined }) {
    const [open, setOpen] = useState(player.isActive);
    const elapsed = usePlayhead(player, updatedAt);

    return (
        <div>
            <ListRow variant="inset" selected={open} render={<button type="button" aria-expanded={open}/>} className="h-auto min-h-8 w-full cursor-default flex-wrap gap-1.5 py-1 text-left" onClick={() => setOpen(!open)}>
                <Icon icon={open ? ChevronDown : ChevronRight} size={12} className="text-text-faint"/>
                <span className="text-xs text-text">{player.displayName || player.identifier || 'Unnamed player'}</span>
                {player.isActive && <StatusPill status="accent">active</StatusPill>}
                {player.isDefaultPlayer && <Pill tone="muted">default</Pill>}
                <Pill tone="muted">{player.playbackState}</Pill>
            </ListRow>
            {open && (
                <div className="flex flex-col gap-2 pb-2 pl-5">
                    <KeyValueList>
                        <KeyValue label="Identifier">{player.identifier || '-'}</KeyValue>
                        <KeyValue label="Title" mono={false}>{player.title || '-'}</KeyValue>
                        <KeyValue label="Artist" mono={false}>{player.artist || '-'}</KeyValue>
                        <KeyValue label="Album" mono={false}>{player.album || '-'}</KeyValue>
                        <KeyValue label="Genre" mono={false}>{player.genre || '-'}</KeyValue>
                        <KeyValue label="Series" mono={false}>{player.seriesName || '-'}</KeyValue>
                        <KeyValue label="Season / episode">{`${player.seasonNumber} / ${player.episodeNumber}`}</KeyValue>
                        <KeyValue label="Media type">{player.mediaType}</KeyValue>
                        <KeyValue label="Content identifier">{player.contentIdentifier || '-'}</KeyValue>
                        <KeyValue label="Shuffle / repeat">{`${player.shuffleMode} / ${player.repeatMode}`}</KeyValue>
                        <KeyValue label="Rate">{player.playbackRate}</KeyValue>
                        <KeyValue label="Position">{`${formatDuration(elapsed)} / ${formatDuration(player.duration)}`}</KeyValue>
                    </KeyValueList>
                    <div className="flex flex-wrap gap-1">
                        {player.supportedCommands.length === 0 ? (
                            <span className="text-xs text-text-muted">No supported commands reported.</span>
                        ) : (
                            player.supportedCommands.map(command => (
                                <Pill key={command} tone="muted" mono>
                                    {command}
                                </Pill>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ClientBlock({client, updatedAt}: { readonly client: ClientSnapshot; readonly updatedAt: number | undefined }) {
    return (
        <div className="flex flex-col gap-1 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <Icon icon={ICONS.app} size={14} className="text-text-faint"/>
                <span className="text-xs font-medium text-text">{client.displayName || client.bundleIdentifier}</span>
                <span className="mono text-text-faint">{client.bundleIdentifier}</span>
                {client.isActive && <StatusPill status="accent">active</StatusPill>}
                <Pill tone="muted">{client.playbackState}</Pill>
                <CountPill>{`${client.players.length} players`}</CountPill>
            </div>
            <div className="pl-5">
                {client.players.map(player => (
                    <PlayerRow key={`${client.bundleIdentifier}:${player.identifier}`} player={player} updatedAt={updatedAt}/>
                ))}
            </div>
        </div>
    );
}

/* Getter failures land in the getter column. */
function GetterTable({call, connected, snapshot}: { readonly call: DeviceCall; readonly connected: boolean; readonly snapshot: StateSnapshot | null }) {
    const [values, setValues] = useState<Readonly<Record<string, string>> | null>(null);

    const readAll = async (): Promise<unknown> => {
        const results = await Promise.all(
            GETTERS.map(async getter => {
                try {
                    return [getter.name, show(await call('device', getter.name))] as const;
                } catch (error) {
                    return [getter.name, error instanceof Error ? error.message : String(error)] as const;
                }
            })
        );

        setValues(Object.fromEntries(results));

        return null;
    };

    return (
        <Section
            wide
            title="Getters against the snapshot"
            icon={ICONS.result}
            actions={<CommandButton label="Read getters" icon={RefreshCw} tooltip="device.*" run={readAll} showResult={false} disabled={!connected}/>}
        >
            <Table.Root label="Device getters" columns={COLUMNS} density="compact">
                <Table.Head>
                    <Table.Column>Getter</Table.Column>
                    <Table.Column>Snapshot</Table.Column>
                    <Table.Column>Getter value</Table.Column>
                    <Table.Column/>
                </Table.Head>
                {GETTERS.map(getter => {
                    const expected = getter.snapshot ? show(getter.snapshot(snapshot)) : null;
                    const actual = values?.[getter.name] ?? null;
                    const differs = expected !== null && actual !== null && expected !== actual;

                    return (
                        <Table.Row key={getter.name} focusable={false}>
                            <Table.Cell mono>{getter.name}</Table.Cell>
                            <Table.Cell mono>{expected ?? 'live'}</Table.Cell>
                            <Table.Cell mono className={clsx(differs && 'text-status-needs-you')}>{actual ?? '-'}</Table.Cell>
                            <Table.Cell>{differs && <Icon icon={ICONS.warning} size={14} className="text-status-needs-you"/>}</Table.Cell>
                        </Table.Row>
                    );
                })}
            </Table.Root>
            <Row>
                <ResultBlock label="Active app" tooltip="nowPlaying.current.app" run={() => call('device', 'nowPlaying.current.app')} disabled={!connected}/>
                <ResultBlock label="Output devices" tooltip="mediaRemote.state.outputDevices" run={() => call('mediaRemote', 'state.outputDevices')} disabled={!connected}/>
            </Row>
        </Section>
    );
}

export function StatePanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const clients = snapshot?.clients ?? [];
    const capabilities = snapshot?.device?.capabilities ?? null;
    const receiverInfo = snapshot?.device?.receiverInfo ?? null;

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section wide title="Clients" icon={ICONS.state} actions={<CountPill>{clients.length}</CountPill>}>
                {clients.length === 0 ? (
                    <EmptyState icon={ICONS.app}>No media client has registered with this device.</EmptyState>
                ) : (
                    <div className="flex flex-col divide-y divide-border-soft">
                        {clients.map(client => (
                            <ClientBlock key={client.bundleIdentifier} client={client} updatedAt={snapshot?.updatedAt}/>
                        ))}
                    </div>
                )}
            </Section>

            <GetterTable call={call} connected={connected} snapshot={snapshot}/>

            <Section title="Capabilities" icon={ICONS.info}>
                {capabilities === null ? (
                    <p className="text-xs text-text-muted">The snapshot carries no capabilities yet.</p>
                ) : (
                    <KeyValueList>
                        {Object.entries(capabilities).map(([name, value]) => (
                            <KeyValue key={name} label={name}>
                                {typeof value === 'boolean' ? <BoolValue value={value}/> : String(value)}
                            </KeyValue>
                        ))}
                    </KeyValueList>
                )}
                <Row>
                    <ResultBlock label="Status" tooltip="device.status" run={() => call('device', 'status')} disabled={!connected}/>
                    <ResultBlock label="Receiver info" tooltip="airplay.info" run={() => call('airplay', 'info')} disabled={!connected}/>
                    <ResultBlock label="Receiver features" tooltip="airplay.features" run={() => call('airplay', 'features')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Receiver info" icon={ICONS.airplay} collapsible defaultOpen={false}>
                {receiverInfo === null ? (
                    <p className="text-xs text-text-muted">The snapshot carries no receiver info yet.</p>
                ) : (
                    <ScrollArea axis="both" className="max-h-96 rounded-lg bg-code-bg" viewportClassName="p-2">
                        <JsonView value={receiverInfo} defaultDepth={2}/>
                    </ScrollArea>
                )}
            </Section>

            <EventFeed wide deviceId={deviceId} title="State events" sources={STATE_SOURCE} empty="The state controller has not emitted anything yet." limit={50}/>
        </PanelBody>
    );
}
