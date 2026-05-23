<template>
    <FluxPane>
        <FluxPaneHeader title="Remote"/>
        <FluxPaneBody>
            <ClickWheel
                :is-disabled="!isAppleTV"
                @up="navigation.up"
                @down="navigation.down"
                @left="navigation.left"
                @right="navigation.right"
                @select="navigation.select"/>

            <FluxButtonStack :class="$style.remotePanelRow">
                <FluxSecondaryButton icon-leading="angle-left" :is-disabled="!isAppleTV" title="Menu / Back" @click="navigation.menu"/>
                <FluxSecondaryButton icon-leading="house" :is-disabled="!isAppleTV" title="Home" @click="navigation.home"/>
                <FluxSecondaryButton icon-leading="rectangle-vertical-history" :is-disabled="!isAppleTV" title="Top Menu" @click="navigation.topMenu"/>
                <FluxSecondaryButton icon-leading="power-off" :is-disabled="!isAppleTV" :title="powerTitle" @click="powerRemote.toggle"/>
            </FluxButtonStack>

            <FluxButtonStack :class="$style.remotePanelRow">
                <FluxSecondaryButton icon-leading="backward-fast" :is-disabled="!isConnected" title="Skip back 15s" @click="seekActions.skipBackward(15)"/>
                <FluxSecondaryButton icon-leading="backward" :is-disabled="!isConnected" title="Previous" @click="controls.previous"/>
                <FluxPrimaryButton
                    :icon-leading="playback.isPlaying.value ? 'pause' : 'play'"
                    :is-disabled="!isConnected"
                    :title="playback.isPlaying.value ? 'Pause' : 'Play'"
                    @click="controls.playPause"/>
                <FluxSecondaryButton icon-leading="forward" :is-disabled="!isConnected" title="Next" @click="controls.next"/>
                <FluxSecondaryButton icon-leading="forward-fast" :is-disabled="!isConnected" title="Skip forward 15s" @click="seekActions.skipForward(15)"/>
            </FluxButtonStack>

            <FluxButtonStack :class="$style.remotePanelRow">
                <FluxSecondaryButton
                    :icon-leading="volume.muted.value ? 'volume-xmark' : 'volume'"
                    :is-disabled="!isConnected"
                    title="Mute"
                    @click="volume.toggleMute"/>
                <FluxSecondaryButton icon-leading="volume-low" :is-disabled="!isConnected" title="Volume down" @click="volume.down"/>
                <FluxSecondaryButton icon-leading="volume-high" :is-disabled="!isConnected" title="Volume up" @click="volume.up"/>
            </FluxButtonStack>

            <FluxButtonStack :class="$style.remotePanelRow">
                <FluxSecondaryButton
                    icon-leading="shuffle"
                    :is-disabled="!isConnected || !modes.shuffleSupported.value"
                    :title="`Shuffle (${modes.shuffle.value})`"
                    @click="modes.advanceShuffle"/>
                <FluxSecondaryButton
                    icon-leading="repeat"
                    :is-disabled="!isConnected || !modes.repeatSupported.value"
                    :title="`Repeat (${modes.repeat.value})`"
                    @click="modes.advanceRepeat"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>
</template>

<script
    lang="ts"
    setup>
    import {
        FluxButtonStack,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPrimaryButton,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { computed } from 'vue';
    import ClickWheel from '@renderer/component/ClickWheel.vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { usePlaybackControls, useSeek } from '@renderer/composable/playback';
    import { useRemoteNavigation, useRemotePower } from '@renderer/composable/remote';
    import {
        useDeviceMetadata,
        usePlaybackModes,
        usePlaybackState,
        usePowerState,
        useVolume
    } from '@renderer/composable/state';

    const {isConnected} = useDeviceConnection();
    const metadata = useDeviceMetadata();
    const navigation = useRemoteNavigation();
    const controls = usePlaybackControls();
    const seekActions = useSeek();
    const playback = usePlaybackState();
    const modes = usePlaybackModes();
    const volume = useVolume();
    const powerRemote = useRemotePower();
    const power = usePowerState();

    const isAppleTV = computed(() => isConnected.value && metadata.isAppleTV.value);

    const powerTitle = computed(() => {
        switch (power.state.value) {
            case 'awake': return 'Power (Awake)';
            case 'idle': return 'Power (Idle)';
            case 'screensaver': return 'Power (Screensaver)';
            case 'asleep': return 'Power (Asleep)';
            default: return 'Power';
        }
    });
</script>

<style
    lang="scss"
    module>
    .remotePanelRow {
        justify-content: center;
    }
</style>
