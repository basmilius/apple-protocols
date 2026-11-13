import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bookmark, ChevronsRight, FastForward, ListMusic, ListPlus, type LucideIcon, Pause, Play, Repeat, Rewind, RotateCcw, RotateCw, Shuffle, SkipBack, SkipForward, Square, ThumbsDown, ThumbsUp, Timer } from 'lucide-react';
import { formatDuration } from '@shared/helpers';
import { Button, ButtonGroup, CommandButton, ControlRow, CountPill, Icon, IconButton, ICONS, PanelBody, PanelGroup, Pill, Section, Select, Slider, StatusBar, StatusPill, TextInput, Tooltip } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import {
    MEDIA_CONTROL_ITEMS,
    NotConnected,
    NumberInput,
    numberOf,
    PanelLink,
    REPEAT_MODE_ITEMS,
    REPEAT_MODES,
    ResultBlock,
    Row,
    SHUFFLE_MODE_ITEMS,
    SHUFFLE_MODES,
    valueOf
} from '@/panels/sdk-shared';

type CommandContext = {
    readonly call: DeviceCall;
    readonly supported: readonly string[];
    readonly connected: boolean;
};

type CommandProps = CommandContext & {
    readonly label: string;
    readonly command: string;
    readonly path: string;
    readonly args?: readonly unknown[];
    readonly icon?: LucideIcon;
};

/* Unsupported commands stay enabled so their actual device behavior can be tested; a dot marks them. */
function Unsupported({command, supported}: { readonly command: string; readonly supported: readonly string[] }) {
    return supported.includes(command) ? null : <span aria-hidden className="pointer-events-none absolute -top-px -right-px size-1.5 rounded-full bg-status-needs-you"/>;
}

function PlaybackCommand({label, command, path, args, icon, call, supported, connected}: CommandProps) {
    const known = supported.includes(command);

    return (
        <span className={clsx('relative inline-flex', !known && 'opacity-60')}>
            <CommandButton label={label} icon={icon} tooltip={known ? path : `${path}, not in supportedCommands`} run={() => call('device', path, args)} disabled={!connected}/>
            <Unsupported command={command} supported={supported}/>
        </span>
    );
}

/* The toggle is the primary key; play, pause and stop are small, for testing the separate commands. */
function TransportKey({label, command, path, icon, primary = false, small = false, call, supported, connected}: CommandProps & { readonly icon: LucideIcon; readonly primary?: boolean; readonly small?: boolean }) {
    const known = supported.includes(command);
    const name = known ? label : `${label}, not in supportedCommands`;

    return (
        <span className={clsx('relative inline-flex', !known && 'opacity-60')}>
            {primary ? (
                <Tooltip label={name}>
                    <Button variant="primary" aria-label={name} disabled={!connected} onClick={() => void call('device', path)}>
                        <Icon icon={icon} size={16}/>
                    </Button>
                </Tooltip>
            ) : (
                <IconButton icon={icon} label={name} size={small ? 'sm' : undefined} disabled={!connected} onClick={() => void call('device', path)}/>
            )}
            <Unsupported command={command} supported={supported}/>
        </span>
    );
}

/* Track the drag locally and seek once on release. */
function Scrubber({elapsed, duration, connected, call}: { readonly elapsed: number; readonly duration: number; readonly connected: boolean; readonly call: DeviceCall }) {
    const [dragging, setDragging] = useState<number | null>(null);
    const position = dragging ?? elapsed;
    const max = duration > 0 ? duration : 100;

    return (
        <div className="flex items-center gap-1">
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

function HoldButton({label, icon, begin, end, call, connected}: { readonly label: string; readonly icon: LucideIcon; readonly begin: string; readonly end: string; readonly call: DeviceCall; readonly connected: boolean }) {
    return (
        <Button
            size="sm"
            variant="secondary"
            disabled={!connected}
            title={`${begin} on press, ${end} on release`}
            onPointerDown={() => void call('device', begin)}
            onPointerUp={() => void call('device', end)}
            onPointerLeave={() => void call('device', end)}
        >
            <Icon icon={icon} size={14}/>
            {label}
        </Button>
    );
}

function CompanionMedia({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [command, setCommand] = useState('Play');
    const [content, setContent] = useState('');
    const [contentError, setContentError] = useState<string | null>(null);

    const send = async (): Promise<unknown> => {
        const trimmed = content.trim();
        setContentError(null);

        if (trimmed.length === 0) {
            return await call('companionLink', 'mediaControlCommand', [command]);
        }

        try {
            return await call('companionLink', 'mediaControlCommand', [command, JSON.parse(trimmed)]);
        } catch (error) {
            setContentError(error instanceof Error ? error.message : String(error));

            throw error;
        }
    };

    return (
        <Section wide title="Companion Link media" icon={ICONS.companionLink}>
            <Row>
                <ResultBlock label="Now playing info" tooltip="companionLink.fetchNowPlayingInfo" run={() => call('companionLink', 'fetchNowPlayingInfo')} disabled={!connected} defaultDepth={3}/>
                <ResultBlock label="Supported actions" tooltip="companionLink.fetchSupportedActions" run={() => call('companionLink', 'fetchSupportedActions')} disabled={!connected} defaultDepth={3}/>
                <ResultBlock label="Media control status" tooltip="companionLink.fetchMediaControlStatus" run={() => call('companionLink', 'fetchMediaControlStatus')} disabled={!connected} defaultDepth={3}/>
            </Row>
            <ControlRow label="Media control" icon={ICONS.send}>
                <Select label="Media control command" value={command} onValueChange={setCommand} items={MEDIA_CONTROL_ITEMS} size="sm"/>
                <CommandButton label="Send" variant="primary" icon={ICONS.send} tooltip="companionLink.mediaControlCommand" run={send} disabled={!connected}/>
            </ControlRow>
            <ControlRow label="Content (JSON)" icon={ICONS.result} hint="Optional, for example {&quot;volume&quot;:0.5}.">
                <TextInput label="Command content as JSON" mono className="h-7 min-w-0 flex-1 basis-40" value={content} onChange={event => setContent(event.target.value)}/>
            </ControlRow>
            {contentError !== null && <p className="text-xs text-status-error">{contentError}</p>}
        </Section>
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

    const supported = snapshot?.supportedCommands ?? [];
    const nowPlaying = snapshot?.nowPlaying ?? null;
    const elapsed = usePlayhead(nowPlaying, snapshot?.updatedAt);
    const playing = nowPlaying?.playbackState.toLowerCase() === 'playing';
    const companionConnected = snapshot?.connection.companionLink.connected === true;
    const context: CommandContext = {call, supported, connected};

    const modes = useMemo(() => {
        const player = snapshot?.clients.flatMap(client => client.players).find(entry => entry.isActive) ?? null;

        return {shuffle: player?.shuffleMode ?? '-', repeat: player?.repeatMode ?? '-'};
    }, [snapshot]);

    return (
        <PanelBody>
            <StatusBar banner={!connected && <NotConnected/>}>
                <StatusPill status={playing ? 'ok' : 'off'}>{nowPlaying?.playbackState || 'unknown'}</StatusPill>
                <CountPill>{`${supported.length} supported commands`}</CountPill>
                {nowPlaying?.title && <span className="truncate text-text-muted">{nowPlaying.title}</span>}
                <PanelLink panel="nowplaying" label="Now playing"/>
            </StatusBar>

            <PanelGroup>
                <Section wide title="Transport" icon={Play}>
                    <Scrubber elapsed={elapsed} duration={nowPlaying?.duration ?? 0} connected={connected} call={call}/>
                    <div className="flex flex-wrap items-center gap-3">
                        <ButtonGroup>
                            <TransportKey {...context} label="Previous" command="PreviousTrack" path="playback.previous" icon={SkipBack}/>
                            <TransportKey {...context} primary label="Play or pause" command="TogglePlayPause" path="playback.playPause" icon={ICONS.playPause}/>
                            <TransportKey {...context} label="Next" command="NextTrack" path="playback.next" icon={SkipForward}/>
                        </ButtonGroup>
                        <ButtonGroup>
                            <TransportKey {...context} small label="Play" command="Play" path="playback.play" icon={Play}/>
                            <TransportKey {...context} small label="Pause" command="Pause" path="playback.pause" icon={Pause}/>
                            <TransportKey {...context} small label="Stop" command="Stop" path="playback.stop" icon={Square}/>
                        </ButtonGroup>
                        <HoldButton label="Rewind" icon={Rewind} begin="playback.beginRewind" end="playback.endRewind" call={call} connected={connected}/>
                        <HoldButton label="Fast forward" icon={FastForward} begin="playback.beginFastForward" end="playback.endFastForward" call={call} connected={connected}/>
                    </div>
                    <ControlRow label="Skip (seconds)" icon={RotateCw}>
                        <NumberInput label="Skip seconds" value={skipSeconds} onValueChange={setSkipSeconds}/>
                        <PlaybackCommand {...context} label="Back" icon={RotateCcw} command="SkipBackward" path="playback.skipBackward" args={[numberOf(skipSeconds, 15)]}/>
                        <PlaybackCommand {...context} label="Forward" icon={RotateCw} command="SkipForward" path="playback.skipForward" args={[numberOf(skipSeconds, 15)]}/>
                    </ControlRow>
                    <ControlRow label="Chapter" icon={ListMusic}>
                        <PlaybackCommand {...context} label="Previous" command="PreviousChapter" path="playback.previousChapter"/>
                        <PlaybackCommand {...context} label="Next" command="NextChapter" path="playback.nextChapter"/>
                    </ControlRow>
                    <p className="text-xs text-text-muted">A dot marks a command the device does not list in its supported commands. It still runs, to see what the device does.</p>
                </Section>
            </PanelGroup>

            <PanelGroup title="Modes, library and queue" icon={ListMusic}>
                <Section title="Modes" icon={Shuffle}>
                    <ControlRow label="Shuffle" icon={Shuffle} value={modes.shuffle}>
                        <Select label="Shuffle mode" value={shuffleMode} onValueChange={setShuffleMode} items={SHUFFLE_MODE_ITEMS} size="sm"/>
                        <PlaybackCommand {...context} label="Set" command="ChangeShuffleMode" path="playback.setShuffleMode" args={[valueOf(SHUFFLE_MODES, shuffleMode)]}/>
                        <PlaybackCommand {...context} label="Advance" command="AdvanceShuffleMode" path="playback.advanceShuffleMode"/>
                    </ControlRow>
                    <ControlRow label="Repeat" icon={Repeat} value={modes.repeat}>
                        <Select label="Repeat mode" value={repeatMode} onValueChange={setRepeatMode} items={REPEAT_MODE_ITEMS} size="sm"/>
                        <PlaybackCommand {...context} label="Set" command="ChangeRepeatMode" path="playback.setRepeatMode" args={[valueOf(REPEAT_MODES, repeatMode)]}/>
                        <PlaybackCommand {...context} label="Advance" command="AdvanceRepeatMode" path="playback.advanceRepeatMode"/>
                    </ControlRow>
                    <ControlRow label="Rate" icon={ChevronsRight} value={nowPlaying ? `${nowPlaying.playbackRate}x` : undefined}>
                        <NumberInput label="Playback rate" value={rate} onValueChange={setRate} className="w-16"/>
                        <PlaybackCommand {...context} label="Set" command="ChangePlaybackRate" path="playback.setPlaybackRate" args={[numberOf(rate, 1)]}/>
                    </ControlRow>
                    <ControlRow label="Sleep timer" icon={Timer} hint="Seconds until playback stops, and the stop mode the device expects.">
                        <NumberInput label="Sleep timer seconds" value={sleepSeconds} onValueChange={setSleepSeconds}/>
                        <NumberInput label="Sleep stop mode" value={stopMode} onValueChange={setStopMode} className="w-14"/>
                        <PlaybackCommand {...context} label="Set" command="SetSleepTimer" path="playback.setSleepTimer" args={[numberOf(sleepSeconds, 1800), numberOf(stopMode, 0)]}/>
                    </ControlRow>
                </Section>

                <Section title="Library and queue" icon={ListMusic}>
                    <ControlRow label="Current item" icon={ICONS.nowPlaying}>
                        <PlaybackCommand {...context} label="Like" icon={ThumbsUp} command="LikeTrack" path="playback.likeTrack"/>
                        <PlaybackCommand {...context} label="Dislike" icon={ThumbsDown} command="DislikeTrack" path="playback.dislikeTrack"/>
                        <PlaybackCommand {...context} label="Bookmark" icon={Bookmark} command="BookmarkTrack" path="playback.bookmarkTrack"/>
                        <PlaybackCommand {...context} label="Add to library" icon={ListPlus} command="AddNowPlayingItemToLibrary" path="playback.addToLibrary"/>
                    </ControlRow>
                    <ControlRow label="Queue length" icon={ListMusic}>
                        <NumberInput label="Queue length" value={queueLength} onValueChange={setQueueLength}/>
                        <PlaybackCommand {...context} label="Request queue" command="GetPlaybackQueue" path="playback.requestPlaybackQueue" args={[numberOf(queueLength, 10)]}/>
                    </ControlRow>
                </Section>

            </PanelGroup>

            {companionConnected && (
                <PanelGroup title="Companion Link" icon={ICONS.companionLink}>
                    <CompanionMedia call={call} connected={connected}/>
                </PanelGroup>
            )}
        </PanelBody>
    );
}
