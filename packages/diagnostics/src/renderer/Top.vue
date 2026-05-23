<template>
    <FluxApplicationTop
        :class="$style.topBar"
        :icon="icon ?? 'apple'"
        :title="title ?? 'Apple Diagnostics'">
        <template #end>
            <TopSlot/>

            <div
                v-if="nowPlaying"
                :class="$style.topNowPlaying">
                <div
                    v-if="nowPlaying.artworkUrl"
                    :class="$style.topArtwork">
                    <img
                        :src="nowPlaying.artworkUrl"
                        alt=""
                        :class="$style.topArtworkImage">
                </div>

                <div :class="$style.topMeta">
                    <strong :class="$style.topTitle">{{ nowPlaying.title }}</strong>
                    <span :class="$style.topSubtitle">{{ nowPlaying.subtitle }}</span>
                </div>

                <FluxIcon
                    :name="nowPlaying.isPlaying ? 'pause' : 'play'"
                    size="sm"
                    :class="$style.topState"/>
            </div>

            <FluxTag
                v-else-if="connectedDevice"
                :icon-leading="connectedDevice.icon"
                :label="connectedDevice.label"
                color="primary"/>
        </template>
    </FluxApplicationTop>
</template>

<script
    lang="ts"
    setup>
    import type { FluxIconName } from '@flux-ui/types';
    import { FluxApplicationTop } from '@flux-ui/application';
    import { FluxIcon, FluxTag } from '@flux-ui/components';
    import { storeToRefs } from 'pinia';
    import { computed } from 'vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { useUiStore } from '@renderer/store';
    import TopSlot from './TopSlot.vue';

    const {icon, title} = storeToRefs(useUiStore());
    const {snapshot, isConnected} = useDeviceConnection();

    const nowPlaying = computed(() => {
        if (!isConnected.value) {
            return null;
        }

        const np = snapshot.value.nowPlaying;
        if (!np.title && !np.artist) {
            return null;
        }

        const parts: string[] = [];
        if (np.artist) {
            parts.push(np.artist);
        }
        if (np.album) {
            parts.push(np.album);
        }

        return {
            title: np.title || '—',
            subtitle: parts.length > 0 ? parts.join(' · ') : (np.app ?? ''),
            artworkUrl: np.artworkUrl,
            isPlaying: np.playbackState === 'Playing'
        };
    });

    const connectedDevice = computed<{icon: FluxIconName; label: string} | null>(() => {
        const device = snapshot.value.device;
        if (!device) {
            return null;
        }

        const icon: FluxIconName =
            device.type === 'appletv' ? 'tv' :
            device.type === 'homepod' || device.type === 'homepod-mini' ? 'computer-speaker' :
            'circle';

        return {icon, label: device.name};
    });
</script>

<style
    lang="scss"
    module>
    .topBar {
        app-region: drag;
    }

    .topNowPlaying {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 10px;
        border-radius: 8px;
        background: var(--gray-100);
        max-width: 360px;
    }

    .topArtwork {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 4px;
        overflow: hidden;
        background: var(--gray-200);
    }

    .topArtworkImage {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .topMeta {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.2;
    }

    .topTitle {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .topSubtitle {
        font-size: 11px;
        color: var(--foreground-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .topState {
        flex-shrink: 0;
        color: var(--foreground-secondary);
    }
</style>
