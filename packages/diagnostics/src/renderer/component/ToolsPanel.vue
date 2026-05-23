<template>
    <FluxPane>
        <FluxPaneHeader title="Tools"/>
        <FluxPaneBody>
            <FluxButtonStack>
                <FluxSecondaryButton :is-disabled="!isAppleTV" label="CC" title="Captions" @click="systemActions.toggleCaptions"/>
                <FluxSecondaryButton :is-disabled="!isAppleTV" icon-leading="moon" label="Dark" @click="systemActions.setAppearance('dark')"/>
                <FluxSecondaryButton :is-disabled="!isAppleTV" icon-leading="sun" label="Light" @click="systemActions.setAppearance('light')"/>
                <FluxSecondaryButton :is-disabled="!isAppleTV" icon-leading="microphone" label="Siri" @click="onSiri"/>
                <FluxSecondaryButton :is-disabled="!isAppleTV" label="Find" title="Find Remote" @click="systemActions.findRemote(true)"/>
            </FluxButtonStack>

            <FluxDivider/>

            <FluxFormField label="Audio URL">
                <FluxFormInput
                    v-model="urlValue"
                    placeholder="https://..."
                    :is-disabled="!isConnected"/>
            </FluxFormField>
            <FluxButtonStack>
                <FluxSecondaryButton
                    icon-leading="circle-play"
                    label="Play URL"
                    :is-disabled="!isConnected || !urlValue"
                    @click="onPlayUrl"/>
                <FluxSecondaryButton
                    icon-leading="signal-stream"
                    label="Stream"
                    :is-disabled="!isConnected || !urlValue"
                    @click="onStreamUrl"/>
            </FluxButtonStack>

            <FluxDivider/>

            <FluxFormField label="Text input">
                <FluxFormInput
                    v-model="textValue"
                    placeholder="Text to send"
                    :is-disabled="!isAppleTV"/>
            </FluxFormField>
            <FluxButtonStack>
                <FluxSecondaryButton :is-disabled="!isAppleTV || !textValue" label="Set" @click="onSetText"/>
                <FluxSecondaryButton :is-disabled="!isAppleTV || !textValue" label="Append" @click="onAppendText"/>
                <FluxDestructiveButton :is-disabled="!isAppleTV" label="Clear" @click="text.clear"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>
</template>

<script
    lang="ts"
    setup>
    import {
        FluxButtonStack,
        FluxDestructiveButton,
        FluxDivider,
        FluxFormField,
        FluxFormInput,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { computed, ref } from 'vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { usePlayUrl, useStreamUrl } from '@renderer/composable/media';
    import { useRemoteSystem, useRemoteText } from '@renderer/composable/remote';
    import { useDeviceMetadata } from '@renderer/composable/state';

    const {isConnected} = useDeviceConnection();
    const metadata = useDeviceMetadata();
    const text = useRemoteText();
    const systemActions = useRemoteSystem();
    const playUrl = usePlayUrl();
    const streamUrl = useStreamUrl();

    const urlValue = ref('');
    const textValue = ref('');
    const siriActive = ref(false);

    const isAppleTV = computed(() => isConnected.value && metadata.isAppleTV.value);

    async function onSiri(): Promise<void> {
        if (siriActive.value) {
            await systemActions.siriStop();
            siriActive.value = false;
        } else {
            await systemActions.siriStart();
            siriActive.value = true;
        }
    }

    async function onPlayUrl(): Promise<void> {
        await playUrl.play(urlValue.value);
    }

    async function onStreamUrl(): Promise<void> {
        await streamUrl.stream(urlValue.value);
    }

    async function onSetText(): Promise<void> {
        await text.set(textValue.value);
    }

    async function onAppendText(): Promise<void> {
        await text.append(textValue.value);
        textValue.value = '';
    }
</script>
