<template>
    <div class="now-playing">
        <div class="now-playing-header">
            <div
                class="now-playing-artwork"
                :class="{empty: !hasArtwork}">
                <img
                    v-if="hasArtwork"
                    :src="nowPlaying.artworkUrl!"
                    alt="">
                <svg
                    class="artwork-placeholder"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path
                        d="M499.7 70.8c7.8 6 12.3 15.3 12.3 25.2v96c0 14.7-10 27.5-24.2 31L384 249v215c0 53-50.1 96-112 96s-112-43-112-96 50.1-96 112-96c17.2 0 33.5 3.3 48 9.2V128c0-14.7 10-27.5 24.2-31l128-32c9.6-2.4 19.7-.2 27.5 5.8"
                        fill="currentColor"/>
                </svg>
            </div>

            <div class="now-playing-info">
                <div class="now-playing-title">
                    {{ hasTrack ? nowPlaying.title : 'Not Playing' }}
                </div>
                <div
                    v-if="nowPlaying.artist || nowPlaying.album"
                    class="now-playing-artist">
                    {{ [nowPlaying.artist, nowPlaying.album].filter(Boolean).join(' \u2022 ') }}
                </div>
                <div class="now-playing-state">
                    {{ nowPlaying.playbackState }}
                </div>
                <div
                    v-if="nowPlaying.app"
                    class="now-playing-app">
                    {{ nowPlaying.app }}
                </div>

                <div
                    v-if="nowPlaying.duration > 0"
                    class="progress-container">
                    <span class="progress-time">{{ formatTime(localElapsed) }}</span>
                    <FluxProgressBar
                        class="progress-track"
                        :value="progressValue"/>
                    <span class="progress-time">{{ formatTime(nowPlaying.duration) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import { computed, onUnmounted, ref, watch } from 'vue';
    import { FluxProgressBar } from '@flux-ui/components';

    const props = defineProps<{
        nowPlaying: {
            title: string;
            artist: string;
            album: string;
            duration: number;
            elapsedTime: number;
            playbackState: string;
            artworkUrl: string | null;
            app: string | null;
            bundleIdentifier: string | null;
        };
    }>();

    const localElapsed = ref(0);
    let lastSyncTime = 0;
    let tickInterval: ReturnType<typeof setInterval> | null = null;

    const isPlaying = computed(() => props.nowPlaying.playbackState === 'Playing');

    const startTicking = () => {
        stopTicking();
        lastSyncTime = Date.now();
        tickInterval = setInterval(() => {
            const delta = (Date.now() - lastSyncTime) / 1000;
            localElapsed.value = Math.min(
                props.nowPlaying.elapsedTime + delta,
                props.nowPlaying.duration > 0 ? props.nowPlaying.duration : Infinity
            );
        }, 500);
    };

    const stopTicking = () => {
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
    };

    watch(() => props.nowPlaying.elapsedTime, (newVal) => {
        localElapsed.value = newVal;
        lastSyncTime = Date.now();
    });

    watch(isPlaying, (playing) => {
        if (playing) {
            startTicking();
        } else {
            stopTicking();
            localElapsed.value = props.nowPlaying.elapsedTime;
        }
    }, {immediate: true});

    onUnmounted(() => {
        stopTicking();
    });

    const progressValue = computed(() => {
        if (props.nowPlaying.duration <= 0) {
            return 0;
        }

        return localElapsed.value / props.nowPlaying.duration;
    });

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);

        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const hasArtwork = computed(() => !!props.nowPlaying.artworkUrl);
    const hasTrack = computed(() => !!props.nowPlaying.title);
</script>
