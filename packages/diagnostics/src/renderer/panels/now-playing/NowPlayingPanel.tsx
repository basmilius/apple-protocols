import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnimatedArtworkResult, LyricsResult } from '@basmilius/apple-sdk';
import { formatDuration, isBytes } from '@shared/helpers';
import { useAppleMusic } from '@/state/apple-music';
import { useDevice, useDeviceCall, usePlayhead } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { EventFeed, NotConnected, NumberInput, numberOf, PanelLink, Row } from '@/panels/sdk-shared';
import { BoolValue, Button, CommandButton, ControlRow, EmptyState, Field, FormError, Icon, ICONS, KeyValue, KeyValueList, Meter, PanelBody, PanelGroup, Pill, Section, StatusPill, TextInput } from '@/ui';
import { ArtworkVideo } from './ArtworkVideo';
import { LyricsDemo } from './LyricsDemo';
import { LyricsView } from './LyricsView';

type Artwork = {
    readonly url: string | null;
    readonly data: unknown;
    readonly mimeType: string;
    readonly identifier: string | null;
    readonly width: number;
    readonly height: number;
};

const LYRICS_SOURCES = ['airplayState'] as const;
const LYRICS_EVENTS = ['lyricsEvent'];

/* Convert IPC hex bytes to base64 for an image data URL. */
function dataUrlOf(mimeType: string, hex: string): string {
    let binary = '';

    for (let i = 0; i < hex.length; i += 2) {
        binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }

    return `data:${mimeType || 'image/jpeg'};base64,${window.btoa(binary)}`;
}

export function NowPlayingPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const {bearerToken, musicUserToken, storefront, update: updateAppleMusic, clearTokens, storageError} = useAppleMusic();

    const [width, setWidth] = useState('600');
    const [height, setHeight] = useState('-1');
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [animated, setAnimated] = useState<AnimatedArtworkResult[] | null>(null);
    const [showLyricsDemo, setShowLyricsDemo] = useState(false);
    const [lyricsResult, setLyricsResult] = useState<LyricsResult | null | undefined>(undefined);
    const lyricsGeneration = useRef(0);

    const nowPlaying = snapshot?.nowPlaying ?? null;
    const elapsed = usePlayhead(nowPlaying, snapshot?.updatedAt, lyricsResult?.text ? 100 : 500);
    const contentIdentifier = snapshot?.clients.find(client => client.isActive)?.contentIdentifier;
    const player = useMemo(() => snapshot?.clients.flatMap(client => client.players).find(entry => entry.isActive) ?? null, [snapshot]);
    const hasTokens = bearerToken.trim().length > 0 && musicUserToken.trim().length > 0;

    useEffect(() => {
        lyricsGeneration.current++;
        setArtwork(null);
        setAnimated(null);
        setLyricsResult(undefined);
    }, [deviceId, connected, contentIdentifier]);

    const fetchLyrics = async (catalog: boolean): Promise<void> => {
        const generation = ++lyricsGeneration.current;
        setLyricsResult(undefined);

        const result = await call('device', catalog ? 'media.getLyricsFromCatalog' : 'media.getLyrics', catalog ? [{bearerToken, musicUserToken, storefront}] : []);

        if (generation === lyricsGeneration.current) {
            setLyricsResult(result as LyricsResult | null);
        }
    };

    const loadArtwork = async (): Promise<unknown> => {
        const result = (await call('device', 'artwork.get', [numberOf(width, 600), numberOf(height, -1)])) as Artwork | null;
        setArtwork(result);

        return result;
    };

    const loadAnimated = async (catalog: boolean): Promise<unknown> => {
        setAnimated(null);

        const result = catalog
            ? await call('device', 'artwork.getAnimatedFromCatalog', [storefront || 'us'])
            : await call('device', 'artwork.getAnimated', [numberOf(width, 600), numberOf(height, -1)]);

        setAnimated(result as AnimatedArtworkResult[]);

        return result;
    };

    const source = artwork === null ? null : (artwork.url ?? (isBytes(artwork.data) ? dataUrlOf(artwork.mimeType, artwork.data.$bytes) : null));
    const empty = nowPlaying === null || (nowPlaying.title === '' && nowPlaying.appName === null);
    const meta = [nowPlaying?.artist, nowPlaying?.album].filter(part => (part ?? '') !== '').join(' • ');
    const playing = nowPlaying?.playbackState.toLowerCase() === 'playing';

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <PanelGroup>
                <Section title="Now playing" icon={ICONS.nowPlaying} actions={<PanelLink panel="playback" label="Playback"/>}>
                    {empty ? (
                        <EmptyState icon={ICONS.nowPlaying}>Nothing is playing on this device.</EmptyState>
                    ) : (
                        <div className="flex flex-wrap items-center gap-5">
                            <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-sunken">
                                {nowPlaying.artworkUrl ? <img src={nowPlaying.artworkUrl} alt="" className="size-full object-cover"/> : <Icon icon={ICONS.nowPlaying} size={32} className="text-text-faint"/>}
                            </div>
                            <div className="flex min-w-60 grow flex-col gap-3">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-lg text-text">{nowPlaying.title || nowPlaying.appName}</span>
                                    <span className="truncate text-sm text-text-muted">{meta || '-'}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <StatusPill status={playing ? 'ok' : 'off'}>{nowPlaying.playbackState || 'unknown'}</StatusPill>
                                    {nowPlaying.mediaType !== 'Unknown' && <Pill tone="muted">{nowPlaying.mediaType}</Pill>}
                                    <Pill tone="muted" icon={<Icon icon={ICONS.app} size={12}/>}>
                                        {nowPlaying.appName ?? nowPlaying.bundleIdentifier ?? 'unknown app'}
                                    </Pill>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-12 shrink-0 text-xs tabular-nums text-text-muted">{formatDuration(elapsed)}</span>
                                    <Meter label="Position" value={nowPlaying.duration > 0 ? elapsed : null} max={Math.max(1, nowPlaying.duration)} valueText={`${formatDuration(elapsed)} of ${formatDuration(nowPlaying.duration)}`} className="grow"/>
                                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-text-muted">{formatDuration(nowPlaying.duration)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </Section>

                <Section title="Metadata" icon={ICONS.info}>
                    {player === null ? (
                        <p className="text-xs text-text-muted">No active player reports metadata.</p>
                    ) : (
                        <KeyValueList>
                            <KeyValue label="Genre" mono={false}>{player.genre || '-'}</KeyValue>
                            <KeyValue label="Series" mono={false}>{player.seriesName || '-'}</KeyValue>
                            <KeyValue label="Season / episode">{`${player.seasonNumber} / ${player.episodeNumber}`}</KeyValue>
                            <KeyValue label="Content identifier">{player.contentIdentifier || '-'}</KeyValue>
                            <KeyValue label="Shuffle / repeat">{`${player.shuffleMode} / ${player.repeatMode}`}</KeyValue>
                            <KeyValue label="Rate">{player.playbackRate}</KeyValue>
                            <KeyValue label="Player" icon={ICONS.app}>{player.displayName || player.identifier || '-'}</KeyValue>
                            <KeyValue label="Bundle" icon={ICONS.app}>{nowPlaying?.bundleIdentifier ?? '-'}</KeyValue>
                        </KeyValueList>
                    )}
                </Section>
            </PanelGroup>

            <PanelGroup title="Media" icon={ICONS.artwork}>
                <Section
                    title="Artwork"
                    icon={ICONS.artwork}
                    actions={artwork !== null && <Pill tone={artwork.url === null ? 'muted' : 'accent'}>{artwork.url === null ? 'inline data' : 'url'}</Pill>}
                >
                    <ControlRow label="Size (pixels)" icon={ICONS.artwork} hint="Width and height; -1 keeps the aspect ratio. Animated artwork uses the same size.">
                        <NumberInput label="Artwork width" value={width} onValueChange={setWidth}/>
                        <NumberInput label="Artwork height" value={height} onValueChange={setHeight}/>
                        <CommandButton label="Get artwork" variant="primary" icon={ICONS.artwork} tooltip="artwork.get" run={loadArtwork} showResult={false} disabled={!connected}/>
                    </ControlRow>
                    {artwork === null ? (
                        <p className="text-xs text-text-muted">Nothing fetched yet. A device without a now playing item answers with null.</p>
                    ) : (
                        <div className="flex flex-wrap gap-4">
                            <div className="size-40 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">{source !== null && <img src={source} alt="" className="size-full object-contain"/>}</div>
                            <KeyValueList className="min-w-0 grow">
                                <KeyValue label="URL">{artwork.url ?? '-'}</KeyValue>
                                <KeyValue label="Mime type">{artwork.mimeType || '-'}</KeyValue>
                                <KeyValue label="Identifier">{artwork.identifier ?? '-'}</KeyValue>
                                <KeyValue label="Dimensions">{`${artwork.width} x ${artwork.height}`}</KeyValue>
                                <KeyValue label="Byte length">{isBytes(artwork.data) ? artwork.data.length : 0}</KeyValue>
                            </KeyValueList>
                        </div>
                    )}
                </Section>

                <Section title="Animated artwork" icon={ICONS.animatedArtwork}>
                    <Row>
                        <CommandButton label="From the device" tooltip="artwork.getAnimated" run={() => loadAnimated(false)} showResult={false} disabled={!connected}/>
                        <CommandButton label="From Apple Music" tooltip="artwork.getAnimatedFromCatalog" run={() => loadAnimated(true)} showResult={false} disabled={!connected}/>
                    </Row>
                    {animated === null ? (
                        <p className="text-xs text-text-muted">Fetch animated artwork for the current item. The Apple Music catalog uses the storefront below.</p>
                    ) : animated.length === 0 ? (
                        <p className="text-xs text-text-muted">No animated artwork was returned for this item.</p>
                    ) : (
                        animated.map((entry, index) => (
                            <div key={`${entry.format}-${index}`} className="flex flex-col gap-2">
                                <div className="flex flex-wrap gap-1.5">
                                    <Pill tone="muted">{entry.format}</Pill>
                                    <Pill tone="muted">{entry.source === 'apple-music' ? 'Apple Music catalog' : 'Device'}</Pill>
                                </div>
                                {entry.url ? (
                                    <ArtworkVideo key={entry.url} url={entry.url}/>
                                ) : (
                                    <p className="text-xs text-text-muted">The device returned no usable HTTP video URL. Files stored on the device cannot be played here.</p>
                                )}
                                <KeyValueList>
                                    <KeyValue label="Video URL">{entry.url ?? '-'}</KeyValue>
                                </KeyValueList>
                            </div>
                        ))
                    )}
                </Section>

                <Section title="Apple Music" icon={ICONS.credentials} collapsible defaultOpen={!hasTokens} actions={<StatusPill status={hasTokens ? 'ok' : 'off'}>{hasTokens ? 'tokens set' : 'no tokens'}</StatusPill>}>
                    <p className="text-xs text-text-muted">Use the headers of a signed-in Apple Music web session. The tokens stay on this computer and serve catalog lyrics and animated artwork.</p>
                    <Field label="Bearer token">
                        <TextInput label="Bearer token" type="password" autoComplete="off" value={bearerToken} onChange={event => updateAppleMusic({bearerToken: event.target.value})}/>
                    </Field>
                    <Field label="Music user token">
                        <TextInput label="Music user token" type="password" autoComplete="off" value={musicUserToken} onChange={event => updateAppleMusic({musicUserToken: event.target.value})}/>
                    </Field>
                    <Field label="Storefront">
                        <TextInput label="Account storefront" value={storefront} maxLength={2} className="w-16" onChange={event => updateAppleMusic({storefront: event.target.value.toLowerCase()})}/>
                    </Field>
                    <div>
                        <Button size="sm" variant="secondary" onClick={clearTokens}>
                            <Icon icon={ICONS.clear} size={14}/>
                            Clear tokens
                        </Button>
                    </div>
                    {storageError && <FormError>{storageError}</FormError>}
                </Section>
            </PanelGroup>

            <PanelGroup title="Lyrics" icon={ICONS.lyrics}>
                <Section wide title="Lyrics" icon={ICONS.lyrics}>
                    <Row>
                        <CommandButton label="Get lyrics" tooltip="media.getLyrics" run={() => fetchLyrics(false)} showResult={false} disabled={!connected}/>
                        <CommandButton label="From Apple Music" tooltip="media.getLyricsFromCatalog" run={() => fetchLyrics(true)} showResult={false} disabled={!connected || !hasTokens}/>
                        <Button size="sm" variant="secondary" onClick={() => setShowLyricsDemo(value => !value)}>
                            {showLyricsDemo ? 'Close preview' : 'Try preview'}
                        </Button>
                    </Row>
                    {showLyricsDemo && <LyricsDemo/>}
                    {lyricsResult === null && <p className="text-xs text-text-muted">No current item, or the track changed during the request.</p>}
                    {lyricsResult && (
                        <div className="flex flex-col gap-2">
                            {lyricsResult.text ? (
                                <LyricsView text={lyricsResult.text} elapsed={elapsed} title={nowPlaying?.title} artist={nowPlaying?.artist} artworkUrl={nowPlaying?.artworkUrl}/>
                            ) : (
                                <p className="text-xs text-text-muted">
                                    {lyricsResult.available ? 'Lyrics are available in the music app, but the device returned no lyrics text.' : 'The device returned no lyrics text for this item.'}
                                </p>
                            )}
                            <KeyValueList>
                                <KeyValue label="Lyrics available">
                                    <BoolValue value={lyricsResult.available}/>
                                </KeyValue>
                                <KeyValue label="Lyrics URL">{lyricsResult.url ?? '-'}</KeyValue>
                                <KeyValue label="Catalog ID">{lyricsResult.catalogId ?? '-'}</KeyValue>
                            </KeyValueList>
                        </div>
                    )}
                </Section>

                <EventFeed wide deviceId={deviceId} title="Lyrics events" sources={LYRICS_SOURCES} names={LYRICS_EVENTS} empty="No lyrics event has come in yet." limit={20}/>
            </PanelGroup>
        </PanelBody>
    );
}
