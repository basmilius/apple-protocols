<template>
    <FluxApplicationContent layout="medium">
        <FluxPane>
            <FluxPaneHeader title="Audio Playback" subtitle="Play media on the connected device"/>

        <FluxPaneBody v-if="!isConnected">
            <FluxPlaceholder
                icon="plug-circle-xmark"
                title="No device connected"
                description="Connect a device first to play media."/>
        </FluxPaneBody>

        <FluxPaneBody v-else>
            <FluxNotice
                type="info"
                message="Play URL lets the device fetch and play the URL itself. Stream sends decoded PCM via RTP from this app."/>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane v-if="isConnected">
        <FluxPaneHeader title="Play URL (device-side)"/>
        <FluxPaneBody>
            <FluxFormField label="URL">
                <FluxFormInput v-model="playUrlValue" placeholder="https://example.com/audio.m4a"/>
            </FluxFormField>

            <FluxNotice v-if="playUrl.error.value" type="danger" :message="playUrl.error.value"/>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Play"
                    :is-disabled="!playUrlValue || playUrl.isPlaying.value"
                    @click="onPlayUrl"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!playUrl.isPlaying.value"
                    @click="playUrl.stop"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane v-if="isConnected">
        <FluxPaneHeader title="Stream URL (PCM via RTP)"/>
        <FluxPaneBody>
            <FluxFormField label="URL">
                <FluxFormInput v-model="streamUrlValue" placeholder="https://bmcdn.nl/doorbell.wav"/>
            </FluxFormField>

            <FluxNotice v-if="streamUrl.error.value" type="danger" :message="streamUrl.error.value"/>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Stream"
                    :is-disabled="!streamUrlValue || streamUrl.isStreaming.value"
                    @click="onStreamUrl"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!streamUrl.isStreaming.value"
                    @click="streamUrl.stop"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane v-if="isConnected">
        <FluxPaneHeader title="Local file">
            <template #actions>
                <FluxSecondaryButton
                    icon-leading="folder-open"
                    label="Pick file…"
                    @click="onPickFile"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxInfoStack v-if="audioFile.currentFile.value">
                <FluxInfo label="File" :value="audioFile.currentFile.value.name"/>
                <FluxInfo label="Path" :value="audioFile.currentFile.value.path"/>
                <FluxInfo label="Size" :value="`${(audioFile.currentFile.value.size / 1024).toFixed(1)} KB`"/>
            </FluxInfoStack>

            <FluxPlaceholder
                v-else
                icon="file-music"
                title="No file selected"
                description="Click 'Pick file…' to choose an audio file (MP3, WAV, OGG)."/>

            <FluxNotice v-if="audioFile.error.value" type="danger" :message="audioFile.error.value"/>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Stream file"
                    :is-disabled="!audioFile.currentFile.value || audioFile.isStreaming.value"
                    @click="onStreamFile"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!audioFile.isStreaming.value"
                    @click="audioFile.stopStream"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane v-if="isConnected">
        <FluxPaneHeader title="Sine wave test tone"/>
        <FluxPaneBody>
            <FluxFormField label="Frequency (Hz)">
                <FluxFormInput
                    v-model.number="sineFrequency"
                    type="number"
                    :min="20"
                    :max="20000"/>
            </FluxFormField>

            <FluxFormField label="Duration (seconds)">
                <FluxFormInput
                    v-model.number="sineDuration"
                    type="number"
                    :min="1"
                    :max="600"/>
            </FluxFormField>

            <FluxNotice v-if="sine.error.value" type="danger" :message="sine.error.value"/>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="wave-sine"
                    label="Play tone"
                    :is-disabled="sine.isPlaying.value"
                    @click="onStartSine"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!sine.isPlaying.value"
                    @click="sine.stop"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>
    </FluxApplicationContent>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplicationContent } from '@flux-ui/application';
    import {
        FluxButtonStack,
        FluxDestructiveButton,
        FluxFormField,
        FluxFormInput,
        FluxInfo,
        FluxInfoStack,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPlaceholder,
        FluxPrimaryButton,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { ref } from 'vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { useAudioFile, usePlayUrl, useSineWave, useStreamUrl } from '@renderer/composable/media';
    import { defineTitle } from '@renderer/composable/ui';

    defineTitle('file-music', 'Audio Playback');

    const {isConnected} = useDeviceConnection();
    const playUrl = usePlayUrl();
    const streamUrl = useStreamUrl();
    const audioFile = useAudioFile();
    const sine = useSineWave();

    const playUrlValue = ref('');
    const streamUrlValue = ref('');
    const sineFrequency = ref(440);
    const sineDuration = ref(30);

    async function onPlayUrl(): Promise<void> {
        await playUrl.play(playUrlValue.value);
    }

    async function onStreamUrl(): Promise<void> {
        await streamUrl.stream(streamUrlValue.value);
    }

    async function onPickFile(): Promise<void> {
        await audioFile.pickFile();
    }

    async function onStreamFile(): Promise<void> {
        await audioFile.streamFile();
    }

    async function onStartSine(): Promise<void> {
        await sine.start({frequency: sineFrequency.value, durationSec: sineDuration.value});
    }
</script>
