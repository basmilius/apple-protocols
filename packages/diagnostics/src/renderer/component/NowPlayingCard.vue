<template>
    <FluxPane>
        <FluxPaneHeader title="Now Playing"/>

        <FluxPaneBody v-if="!isConnected">
            <FluxPlaceholder
                icon="plug-circle-xmark"
                title="No device connected"
                description="Connect this device to see now-playing information."/>
        </FluxPaneBody>

        <FluxPaneBody v-else-if="!hasTrack">
            <FluxPlaceholder
                icon="music"
                title="Nothing playing"
                description="Start playback on the device to see metadata here."/>
        </FluxPaneBody>

        <FluxPaneBody v-else>
            <FluxFlex>
                <div
                    v-if="artwork.url.value"
                    :class="$style.nowPlayingCardArtwork">
                    <img
                        :src="artwork.url.value"
                        :alt="nowPlaying.title.value"
                        :class="$style.nowPlayingCardArtworkImage">
                </div>

                <FluxFlexItem :grow="1">
                    <FluxInfoStack>
                        <FluxInfo label="Title" :value="nowPlaying.title.value || '—'"/>
                        <FluxInfo label="Artist" :value="nowPlaying.artist.value || '—'"/>
                        <FluxInfo label="Album" :value="nowPlaying.album.value || '—'"/>
                        <FluxInfo
                            v-if="nowPlaying.app.value"
                            label="App"
                            :value="nowPlaying.app.value"/>
                        <FluxInfo label="Type" :value="nowPlaying.mediaType.value"/>
                    </FluxInfoStack>
                </FluxFlexItem>
            </FluxFlex>

            <FluxProgressBar
                v-if="playback.duration.value > 0"
                :value="liveProgress"/>

            <FluxFlex>
                <FluxFlexItem :grow="1">
                    <small>{{ formatTime(liveElapsed) }}</small>
                </FluxFlexItem>
                <FluxFlexItem>
                    <small>{{ formatTime(playback.duration.value) }}</small>
                </FluxFlexItem>
            </FluxFlex>

            <FluxButtonStack>
                <FluxSecondaryButton
                    icon-leading="backward-fast"
                    title="Skip back 15s"
                    @click="seekActions.skipBackward(15)"/>
                <FluxSecondaryButton
                    icon-leading="backward"
                    title="Previous"
                    @click="controls.previous"/>
                <FluxPrimaryButton
                    :icon-leading="playback.isPlaying.value ? 'pause' : 'play'"
                    :title="playback.isPlaying.value ? 'Pause' : 'Play'"
                    @click="controls.playPause"/>
                <FluxSecondaryButton
                    icon-leading="forward"
                    title="Next"
                    @click="controls.next"/>
                <FluxSecondaryButton
                    icon-leading="forward-fast"
                    title="Skip forward 15s"
                    @click="seekActions.skipForward(15)"/>
                <FluxSecondaryButton
                    icon-leading="stop"
                    title="Stop"
                    @click="controls.stop"/>
            </FluxButtonStack>

            <FluxButtonStack>
                <FluxSecondaryButton
                    icon-leading="shuffle"
                    :label="`Shuffle: ${modes.shuffle.value}`"
                    :is-disabled="!modes.shuffleSupported.value"
                    @click="modes.advanceShuffle"/>
                <FluxSecondaryButton
                    icon-leading="repeat"
                    :label="`Repeat: ${modes.repeat.value}`"
                    :is-disabled="!modes.repeatSupported.value"
                    @click="modes.advanceRepeat"/>
            </FluxButtonStack>

            <template v-if="volume.available.value">
                <FluxDivider/>

                <FluxFormSlider
                    :model-value="volume.percent.value"
                    :min="0"
                    :max="100"
                    @update:model-value="onVolumeChange"/>

                <FluxButtonStack>
                    <FluxSecondaryButton
                        icon-leading="volume-low"
                        @click="volume.down"/>
                    <FluxSecondaryButton
                        :icon-leading="volume.muted.value ? 'volume-xmark' : 'volume'"
                        :label="volume.muted.value ? 'Muted' : 'Mute'"
                        @click="volume.toggleMute"/>
                    <FluxSecondaryButton
                        icon-leading="volume-high"
                        @click="volume.up"/>
                </FluxButtonStack>
            </template>
        </FluxPaneBody>
    </FluxPane>
</template>

<script
    lang="ts"
    setup>
    import {
        FluxButtonStack,
        FluxDivider,
        FluxFlex,
        FluxFlexItem,
        FluxFormSlider,
        FluxInfo,
        FluxInfoStack,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPlaceholder,
        FluxPrimaryButton,
        FluxProgressBar,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { computed, onUnmounted, ref, watch } from 'vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { usePlaybackControls, useSeek } from '@renderer/composable/playback';
    import {
        useArtwork,
        useNowPlaying,
        usePlaybackModes,
        usePlaybackState,
        useVolume
    } from '@renderer/composable/state';

    const {isConnected} = useDeviceConnection();
    const nowPlaying = useNowPlaying();
    const artwork = useArtwork();
    const playback = usePlaybackState();
    const modes = usePlaybackModes();
    const controls = usePlaybackControls();
    const seekActions = useSeek();
    const volume = useVolume();

    const hasTrack = computed(() => !!nowPlaying.title.value || !!nowPlaying.artist.value);

    const liveElapsed = ref(0);
    let lastSyncTime = Date.now();
    let tickInterval: ReturnType<typeof setInterval> | null = null;

    function stopTicking(): void {
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
    }

    function startTicking(): void {
        stopTicking();
        lastSyncTime = Date.now();
        tickInterval = setInterval(() => {
            const delta = (Date.now() - lastSyncTime) / 1000;
            const max = playback.duration.value > 0 ? playback.duration.value : Number.POSITIVE_INFINITY;
            liveElapsed.value = Math.min(playback.elapsed.value + delta, max);
        }, 500);
    }

    watch(() => playback.elapsed.value, value => {
        liveElapsed.value = value;
        lastSyncTime = Date.now();
    }, {immediate: true});

    watch(() => playback.isPlaying.value, playing => {
        if (playing) {
            startTicking();
        } else {
            stopTicking();
            liveElapsed.value = playback.elapsed.value;
        }
    }, {immediate: true});

    onUnmounted(stopTicking);

    const liveProgress = computed(() => {
        const duration = playback.duration.value;
        if (duration <= 0) {
            return 0;
        }
        return Math.min(1, Math.max(0, liveElapsed.value / duration));
    });

    function formatTime(seconds: number): string {
        if (!Number.isFinite(seconds) || seconds <= 0) {
            return '0:00';
        }

        const total = Math.floor(seconds);
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    async function onVolumeChange(value: number): Promise<void> {
        await volume.setPercent(value);
    }
</script>

<style
    lang="scss"
    module>
    .nowPlayingCardArtwork {
        width: 100%;
        max-width: 200px;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        align-self: flex-start;
        border-radius: 8px;
        overflow: hidden;
        background: var(--gray-100);
    }

    .nowPlayingCardArtworkImage {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
</style>
