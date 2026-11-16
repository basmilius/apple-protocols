import type { AppleTV, HomePod, NowPlaying } from '@apple-protocols/devices';
import { fetchAnimatedArtwork, fetchLyrics } from '@apple-protocols/devices/catalog';
import { handle } from '../../ipc';
import type { ChannelContext } from '../context';

/**
 * Apple Music catalog lookups for the item playing now. A lookup whose item changed while it ran
 * returns nothing, so a slow answer never shows up under the next track.
 */
export function registerCatalogChannels(context: ChannelContext): void {
    const deviceOf = (deviceId: string): AppleTV | HomePod => {
        const device = context.sessions.sessions.get(deviceId)?.device;

        if (!device) {
            throw new Error(`No session for device '${deviceId}'. Connect first.`);
        }

        return device;
    };

    const sameItem = (device: AppleTV | HomePod, item: NowPlaying): boolean => device.nowPlaying.current?.contentIdentifier === item.contentIdentifier;

    handle('catalog:lyrics', async request => {
        const device = deviceOf(request.deviceId);
        const item = device.nowPlaying.current;

        if (!item?.contentIdentifier || !item.lyricsId) {
            return null;
        }

        const text = await fetchLyrics(item.lyricsId, {bearerToken: request.bearerToken, musicUserToken: request.musicUserToken, storefront: request.storefront});

        if (!sameItem(device, item)) {
            return null;
        }

        return {identifier: item.contentIdentifier, catalogId: item.lyricsId, text, available: text ? true : null, url: null};
    });

    handle('catalog:animatedArtwork', async request => {
        const device = deviceOf(request.deviceId);
        const item = device.nowPlaying.current;

        if (!item?.storeAlbumId) {
            return [];
        }

        const artwork = await fetchAnimatedArtwork(item.storeAlbumId, {storefront: request.storefront || 'us'});

        return sameItem(device, item) ? artwork : [];
    });
}
