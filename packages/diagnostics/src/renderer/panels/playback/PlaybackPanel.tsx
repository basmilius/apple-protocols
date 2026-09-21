import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Music } from 'lucide-react';
import { LyricsView } from './LyricsView';
import { LyricsDemo } from './LyricsDemo';
import { useAppleMusic } from '@/state/apple-music';
import type { LyricsResult } from '@basmilius/apple-sdk';
import { formatDuration, formatTime } from '@shared/helpers';
import { Badge, Button, CommandButton, EmptyState, Field, Icon, JsonView, KeyValue, KeyValueList, Section, Select, Slider } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall, useDeviceEvents, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import {
    COMMAND_ITEMS,
    COMMANDS,
    Labeled,
    NotConnected,
    NumberInput,
    numberOf,
    PanelBody,
    REPEAT_MODE_ITEMS,
    REPEAT_MODES,
    Row,
    SHUFFLE_MODE_ITEMS,
    SHUFFLE_MODES,
    valueOf
} from '@/panels/sdk-shared';

type CommandProps = {
    readonly label: string;
    readonly command: string | null;
    readonly path: string;
    readonly args?: readonly unknown[];
    readonly call: DeviceCall;
    readonly supported: readonly string[];
    readonly connected: boolean;
    readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'positive';
};

/* Keep unsupported commands enabled so their actual device behavior can be tested. */
function PlaybackCommand({label, command, path, args, call, supported, connected, variant}: CommandProps) {
    const unknown = command !== null && !supported.includes(command);

    return (
        <span className={clsx('relative inline-flex', unknown && 'opacity-55')}>
            <CommandButton label={label} variant={variant} run={() => call('device', path, args)} disabled={!connected}/>
            {unknown && <span aria-hidden className="pointer-events-none absolute -right-px -top-px h-1.5 w-1.5 rounded-full bg-status-needs-you"/>}
        </span>
    );
}

/* Track the drag locally and seek once on release. */
function Scrubber({elapsed, duration, connected, call}: { readonly elapsed: number; readonly duration: number; readonly connected: boolean; readonly call: DeviceCall }) {
    const [dragging, setDragging] = useState<number | null>(null);
    const position = dragging ?? elapsed;
    const max = duration > 0 ? duration : 100;

    return (
        <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-text-muted">{formatDuration(position)}</span>
            <Slider
                label="Position"
                value={Math.min(position, max)}
                max={max}
                step={1}
                disabled={!connected || duration <= 0}
                onValueChange={setDragging}
                onValueCommitted={next => {
                    setDragging(null);
                    void call('device', 'playback.seekTo', [next]);
                }}
            />
            <span className="w-12 shrink-0 text-xs tabular-nums text-text-muted">{formatDuration(duration)}</span>
        </div>
    );
}

export function PlaybackPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const [skipSeconds, setSkipSeconds] = useState('15');
    const [shuffleMode, setShuffleMode] = useState('Off');
    const [repeatMode, setRepeatMode] = useState('Off');
    const [rate, setRate] = useState('1');
    const [sleepSeconds, setSleepSeconds] = useState('1800');
    const [stopMode, setStopMode] = useState('0');
    const [queueLength, setQueueLength] = useState('10');
    const [showLyricsDemo, setShowLyricsDemo] = useState(false);
    const {bearerToken, musicUserToken, storefront, update: updateAppleMusic, clearTokens, storageError} = useAppleMusic();
    const lyricsGeneration = useRef(0);
    const [lyricsResult, setLyricsResult] = useState<LyricsResult | null | undefined>(undefined);
    const [command, setCommand] = useState('Play');
    const [commandOptions, setCommandOptions] = useState('');
    const [optionsError, setOptionsError] = useState<string | null>(null);

    const lyrics = useDeviceEvents(deviceId, {sources: ['airplayState'], names: ['lyricsEvent'], limit: 20});
    const supported = snapshot?.supportedCommands ?? [];
    const nowPlaying = snapshot?.nowPlaying ?? null;
    const elapsed = usePlayhead(nowPlaying, snapshot?.updatedAt, lyricsResult?.text ? 100 : 500);

    useEffect(() => {
        lyricsGeneration.current++;
        setLyricsResult(undefined);
    }, [deviceId, connected, snapshot?.clients.find(client => client.isActive)?.contentIdentifier]);

    async function fetchLyrics(catalog: boolean): Promise<void> {
        const generation = ++lyricsGeneration.current;
        setLyricsResult(undefined);
        const result = await call('device', catalog ? 'media.getLyricsFromCatalog' : 'media.getLyrics', catalog
            ? [{bearerToken, musicUserToken, storefront}]
            : []);
        if (generation === lyricsGeneration.current) setLyricsResult(result as LyricsResult | null);
    }

    const modes = useMemo(() => {
        const player = snapshot?.clients.flatMap(client => client.players).find(entry => entry.isActive) ?? null;

        return {shuffle: player?.shuffleMode ?? '-', repeat: player?.repeatMode ?? '-'};
    }, [snapshot]);

    useEffect(() => {
        setOptionsError(null);
    }, [commandOptions]);

    const sendCommand = async (): Promise<unknown> => {
        const trimmed = commandOptions.trim();
        let options: unknown;

        if (trimmed.length > 0) {
            try {
                options = JSON.parse(trimmed);
            } catch (error) {
                setOptionsError(error instanceof Error ? error.message : String(error));
                throw error;
            }
        }

        return await call('airplay', 'sendCommand', trimmed.length > 0 ? [valueOf(COMMANDS, command), options] : [valueOf(COMMANDS, command)]);
    };

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section title="Now playing" actions={nowPlaying?.mediaType !== undefined && nowPlaying.mediaType !== 'Unknown' && <Badge tone="muted">{nowPlaying.mediaType}</Badge>}>
                {nowPlaying === null || (nowPlaying.title === '' && nowPlaying.appName === null) ? (
                    <EmptyState icon={<Icon icon={Music} size={18}/>} className="py-4">
                        Nothing is playing on this device.
                    </EmptyState>
                ) : (
                    <div className="flex gap-4">
                        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
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
                                <KeyValue label="Genre" mono={false}>
                                    {nowPlaying.genre || '-'}
                                </KeyValue>
                                <KeyValue label="App" mono={false}>
                                    {nowPlaying.appName ?? nowPlaying.bundleIdentifier ?? '-'}
                                </KeyValue>
                                <KeyValue label="Rate">{nowPlaying.playbackRate}</KeyValue>
                            </KeyValueList>
                        </div>
                    </div>
                )}
            </Section>

            <Section
                title="Transport"
                actions={
                    <>
                        <Badge tone="muted">{nowPlaying?.playbackState ?? 'unknown'}</Badge>
                        <Badge tone="muted">{`${supported.length} commands`}</Badge>
                    </>
                }
            >
                <Scrubber elapsed={elapsed} duration={nowPlaying?.duration ?? 0} connected={connected} call={call}/>
                <Row>
                    <PlaybackCommand label="Play" command="Play" path="playback.play" call={call} supported={supported} connected={connected} variant="primary"/>
                    <PlaybackCommand label="Pause" command="Pause" path="playback.pause" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Play/pause" command="TogglePlayPause" path="playback.playPause" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Stop" command="Stop" path="playback.stop" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Next" command="NextTrack" path="playback.next" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Previous" command="PreviousTrack" path="playback.previous" call={call} supported={supported} connected={connected}/>
                </Row>
                <Row>
                    <Labeled label="Skip (s)">
                        <NumberInput label="Skip seconds" value={skipSeconds} onValueChange={setSkipSeconds}/>
                    </Labeled>
                    <PlaybackCommand
                        label="Skip forward"
                        command="SkipForward"
                        path="playback.skipForward"
                        args={[numberOf(skipSeconds, 15)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                    <PlaybackCommand
                        label="Skip backward"
                        command="SkipBackward"
                        path="playback.skipBackward"
                        args={[numberOf(skipSeconds, 15)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                    <PlaybackCommand label="Next chapter" command="NextChapter" path="playback.nextChapter" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Previous chapter" command="PreviousChapter" path="playback.previousChapter" call={call} supported={supported} connected={connected}/>
                </Row>
            </Section>

            <Section title="Scan" actions={<Badge tone="muted">press and hold</Badge>}>
                <Row>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={!connected}
                        onPointerDown={() => void call('device', 'playback.beginFastForward')}
                        onPointerUp={() => void call('device', 'playback.endFastForward')}
                        onPointerLeave={() => void call('device', 'playback.endFastForward')}
                    >
                        Fast forward
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={!connected}
                        onPointerDown={() => void call('device', 'playback.beginRewind')}
                        onPointerUp={() => void call('device', 'playback.endRewind')}
                        onPointerLeave={() => void call('device', 'playback.endRewind')}
                    >
                        Rewind
                    </Button>
                    <PlaybackCommand label="Begin FF" command="BeginFastForward" path="playback.beginFastForward" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="End FF" command="EndFastForward" path="playback.endFastForward" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Begin rewind" command="BeginRewind" path="playback.beginRewind" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="End rewind" command="EndRewind" path="playback.endRewind" call={call} supported={supported} connected={connected}/>
                </Row>
            </Section>

            <Section
                title="Modes"
                actions={
                    <Badge tone="muted" mono>
                        {`shuffle ${modes.shuffle} / repeat ${modes.repeat}`}
                    </Badge>
                }
            >
                <Row>
                    <Labeled label="Shuffle">
                        <Select label="Shuffle mode" value={shuffleMode} onValueChange={setShuffleMode} items={SHUFFLE_MODE_ITEMS} size="sm"/>
                    </Labeled>
                    <PlaybackCommand
                        label="Set shuffle"
                        command="ChangeShuffleMode"
                        path="playback.setShuffleMode"
                        args={[valueOf(SHUFFLE_MODES, shuffleMode)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                    <PlaybackCommand label="Advance shuffle" command="AdvanceShuffleMode" path="playback.advanceShuffleMode" call={call} supported={supported} connected={connected}/>
                </Row>
                <Row>
                    <Labeled label="Repeat">
                        <Select label="Repeat mode" value={repeatMode} onValueChange={setRepeatMode} items={REPEAT_MODE_ITEMS} size="sm"/>
                    </Labeled>
                    <PlaybackCommand
                        label="Set repeat"
                        command="ChangeRepeatMode"
                        path="playback.setRepeatMode"
                        args={[valueOf(REPEAT_MODES, repeatMode)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                    <PlaybackCommand label="Advance repeat" command="AdvanceRepeatMode" path="playback.advanceRepeatMode" call={call} supported={supported} connected={connected}/>
                </Row>
                <Row>
                    <Labeled label="Rate">
                        <NumberInput label="Playback rate" value={rate} onValueChange={setRate} className="w-16"/>
                    </Labeled>
                    <PlaybackCommand
                        label="Set playback rate"
                        command="ChangePlaybackRate"
                        path="playback.setPlaybackRate"
                        args={[numberOf(rate, 1)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                    <Labeled label="Sleep (s)">
                        <NumberInput label="Sleep timer seconds" value={sleepSeconds} onValueChange={setSleepSeconds}/>
                    </Labeled>
                    <Labeled label="Stop mode">
                        <NumberInput label="Sleep stop mode" value={stopMode} onValueChange={setStopMode} className="w-14"/>
                    </Labeled>
                    <PlaybackCommand
                        label="Set sleep timer"
                        command="SetSleepTimer"
                        path="playback.setSleepTimer"
                        args={[numberOf(sleepSeconds, 1800), numberOf(stopMode, 0)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                </Row>
            </Section>

            <Section title="Library">
                <Row>
                    <PlaybackCommand label="Like" command="LikeTrack" path="playback.likeTrack" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Dislike" command="DislikeTrack" path="playback.dislikeTrack" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Bookmark" command="BookmarkTrack" path="playback.bookmarkTrack" call={call} supported={supported} connected={connected}/>
                    <PlaybackCommand label="Add to library" command="AddNowPlayingItemToLibrary" path="playback.addToLibrary" call={call} supported={supported} connected={connected}/>
                </Row>
                <Row>
                    <Labeled label="Queue length">
                        <NumberInput label="Queue length" value={queueLength} onValueChange={setQueueLength}/>
                    </Labeled>
                    <PlaybackCommand
                        label="Request queue"
                        command="GetPlaybackQueue"
                        path="playback.requestPlaybackQueue"
                        args={[numberOf(queueLength, 10)]}
                        call={call}
                        supported={supported}
                        connected={connected}
                    />
                </Row>
            </Section>

            <Section title="Lyrics" actions={<Badge tone="muted">{`${lyrics.length} events`}</Badge>}>
                <Row>
                    <Button size="sm" variant="secondary" onClick={() => setShowLyricsDemo(value => !value)}>{showLyricsDemo ? 'Close preview' : 'Try preview'}</Button>
                    <CommandButton label="Get lyrics" run={() => fetchLyrics(false)} disabled={!connected}/>
                    <CommandButton label="Get from Apple Music" run={() => fetchLyrics(true)} disabled={!connected || !bearerToken.trim() || !musicUserToken.trim()}/>
                </Row>
                {showLyricsDemo && <LyricsDemo/>}
                <details className="text-xs">
                    <summary className="cursor-pointer text-text-muted">Apple Music authorization</summary>
                    <div className="mt-2 space-y-2">
                        <p className="text-text-muted">Use headers from your signed-in Apple Music web session. Tokens are remembered locally on this computer.</p>
                        <Field label="Bearer token" type="password" autoComplete="off" value={bearerToken} onChange={event => updateAppleMusic({bearerToken: event.target.value})}/>
                        <Field label="Music user token" type="password" autoComplete="off" value={musicUserToken} onChange={event => updateAppleMusic({musicUserToken: event.target.value})}/>
                        <Field label="Account storefront" value={storefront} maxLength={2} onChange={event => updateAppleMusic({storefront: event.target.value.toLowerCase()})}/>
                        <Button size="sm" variant="secondary" onClick={clearTokens}>Clear tokens</Button>
                        {storageError && <p className="text-status-error">{storageError}</p>}
                    </div>
                </details>
                {lyricsResult === null && <p className="text-xs text-text-muted">No current item, or the track changed during the request.</p>}
                {lyricsResult && (
                    <div className="space-y-2">
                        {lyricsResult.text ? (
                            <LyricsView text={lyricsResult.text} elapsed={elapsed} title={nowPlaying?.title} artist={nowPlaying?.artist} artworkUrl={nowPlaying?.artworkUrl}/>
                        ) : (
                            <p className="text-xs text-text-muted">{lyricsResult.available
                                ? 'Lyrics are available in the music app, but the device returned no lyrics text.'
                                : 'The device returned no lyrics text for this item.'}</p>
                        )}
                        <KeyValueList>
                            <KeyValue label="Lyrics available">{lyricsResult.available === null ? 'Unknown' : lyricsResult.available ? 'Yes' : 'No'}</KeyValue>
                            <KeyValue label="Lyrics URL">{lyricsResult.url ?? '-'}</KeyValue>
                            <KeyValue label="Catalog ID">{lyricsResult.catalogId ?? '-'}</KeyValue>
                        </KeyValueList>
                    </div>
                )}
                <div className="max-h-56 overflow-auto rounded-lg border border-border bg-code-bg p-2">
                    {lyrics.length === 0 ? (
                        <p className="text-xs text-text-muted">No lyrics event has come in yet.</p>
                    ) : (
                        [...lyrics].reverse().map(event => (
                            <div key={event.sequence} className="border-b border-border-soft py-1 last:border-b-0">
                                <span className="mono text-code-dim">{formatTime(event.timestamp)}</span>
                                <JsonView value={event.payload} defaultDepth={2}/>
                            </div>
                        ))
                    )}
                </div>
            </Section>

            <Section title="Raw command" actions={<Badge tone="accent">airplay.sendCommand</Badge>}>
                <Row>
                    <Select label="Command" value={command} onValueChange={setCommand} items={COMMAND_ITEMS} size="sm"/>
                    <Badge tone="muted" mono>{valueOf(COMMANDS, command)}</Badge>
                    <CommandButton label="Send" variant="primary" run={sendCommand} disabled={!connected}/>
                </Row>
                <Field
                    label="Command options as JSON"
                    mono
                    className="h-7"
                    placeholder='Options as JSON, for example {"skipInterval":30}'
                    value={commandOptions}
                    onChange={event => setCommandOptions(event.target.value)}
                />
                {optionsError !== null && <p className="text-xs text-status-error">{optionsError}</p>}
            </Section>
        </PanelBody>
    );
}
