import { useEffect, useState } from 'react';
import type { AnimatedArtworkResult } from '@basmilius/apple-sdk';
import { isBytes } from '@shared/helpers';
import { Badge, CommandButton, KeyValue, KeyValueList, Section } from '@/ui';
import { useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { Labeled, NotConnected, NumberInput, numberOf, PanelBody, Row } from '@/panels/sdk-shared';
import { ArtworkVideo } from './ArtworkVideo';

type Artwork = {
    readonly url: string | null;
    readonly data: unknown;
    readonly mimeType: string;
    readonly identifier: string | null;
    readonly width: number;
    readonly height: number;
};

/* Convert IPC hex bytes to base64 for an image data URL. */
function dataUrlOf(mimeType: string, hex: string): string {
    let binary = '';

    for (let i = 0; i < hex.length; i += 2) {
        binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }

    return `data:${mimeType || 'image/jpeg'};base64,${window.btoa(binary)}`;
}

export function ArtworkPanel({deviceId}: PanelProps) {
    const {connected, snapshot} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const [width, setWidth] = useState('600');
    const [height, setHeight] = useState('-1');
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [animated, setAnimated] = useState<AnimatedArtworkResult[] | null>(null);

    useEffect(() => {
        setArtwork(null);
        setAnimated(null);
    }, [deviceId, connected, snapshot?.clients.find(client => client.isActive)?.contentIdentifier]);

    const load = async (): Promise<unknown> => {
        const result = (await call('device', 'artwork.get', [numberOf(width, 600), numberOf(height, -1)])) as Artwork | null;
        setArtwork(result);

        return result;
    };

    const source = artwork === null ? null : (artwork.url ?? (isBytes(artwork.data) ? dataUrlOf(artwork.mimeType, artwork.data.$bytes) : null));

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section title="Artwork" actions={artwork !== null && <Badge tone={artwork.url === null ? 'muted' : 'accent'}>{artwork.url === null ? 'inline data' : 'url'}</Badge>}>
                <Row>
                    <Labeled label="Width">
                        <NumberInput label="Artwork width" value={width} onValueChange={setWidth}/>
                    </Labeled>
                    <Labeled label="Height">
                        <NumberInput label="Artwork height" value={height} onValueChange={setHeight}/>
                    </Labeled>
                    <CommandButton label="Get artwork" variant="primary" run={load} disabled={!connected}/>
                </Row>

                {artwork === null ? (
                    <p className="text-xs text-text-muted">Nothing fetched yet. A device without a now playing item answers with null.</p>
                ) : (
                    <div className="flex flex-wrap gap-4">
                        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
                            {source !== null && <img src={source} alt="" className="h-full w-full object-contain"/>}
                        </div>
                        <div className="min-w-0 grow">
                            <KeyValueList>
                                <KeyValue label="Source">{artwork.url === null ? 'data' : 'url'}</KeyValue>
                                <KeyValue label="URL">{artwork.url ?? '-'}</KeyValue>
                                <KeyValue label="Mime type">{artwork.mimeType || '-'}</KeyValue>
                                <KeyValue label="Identifier">{artwork.identifier ?? '-'}</KeyValue>
                                <KeyValue label="Dimensions">
                                    {artwork.width} x {artwork.height}
                                </KeyValue>
                                <KeyValue label="Byte length">{isBytes(artwork.data) ? artwork.data.length : 0}</KeyValue>
                            </KeyValueList>
                        </div>
                    </div>
                )}
            </Section>

            <Section title="Animated artwork">
                <Row>
                    <CommandButton label="Get animated artwork" run={async () => {
                        setAnimated(null);
                        const result = await call('device', 'artwork.getAnimated', [numberOf(width, 600), numberOf(height, -1)]);
                        setAnimated(result as AnimatedArtworkResult[]);
                        return result;
                    }} disabled={!connected}/>
                    <CommandButton label="Get from Apple Music" run={async () => {
                        setAnimated(null);
                        const result = await call('device', 'artwork.getAnimatedFromCatalog', []);
                        setAnimated(result as AnimatedArtworkResult[]);
                        return result;
                    }} disabled={!connected}/>
                </Row>
                {animated === null ? (
                    <p className="text-xs text-text-muted">Fetch animated artwork for the current item.</p>
                ) : animated.length === 0 ? (
                    <p className="text-xs text-text-muted">No animated artwork was returned for this item. Apple Music can supply album artwork when the device returns none.</p>
                ) : animated.map((entry, index) => (
                    <div key={`${entry.format}-${index}`} className="space-y-2">
                        <Badge tone="muted">{entry.format}</Badge>
                        <Badge tone="muted">{entry.source === 'apple-music' ? 'Apple Music catalog' : 'Device'}</Badge>
                        {entry.url ? (
                            <ArtworkVideo key={entry.url} url={entry.url}/>
                        ) : (
                            <p className="text-xs text-text-muted">The device returned no usable HTTP video URL. Files stored on the device cannot be played here.</p>
                        )}
                        <KeyValueList><KeyValue label="Video URL">{entry.url ?? '-'}</KeyValue></KeyValueList>
                    </div>
                ))}
            </Section>
        </PanelBody>
    );
}
