<template>
    <FluxApplicationContent layout="medium">
        <FluxPane>
            <FluxPaneHeader title="Remote" :subtitle="metadata.name.value || 'No device connected'"/>

            <FluxPaneBody v-if="!isConnected">
                <FluxPlaceholder
                    icon="plug-circle-xmark"
                    title="No device connected"
                    description="Connect a device first to use remote control."/>
            </FluxPaneBody>

            <FluxPaneBody v-else-if="!metadata.isAppleTV.value">
                <FluxNotice
                    type="info"
                    message="Remote control is only available on Apple TV devices. Use Now Playing for HomePod media control."/>
            </FluxPaneBody>

            <FluxPaneBody v-else>
                <ClickWheel
                    @up="navigation.up"
                    @down="navigation.down"
                    @left="navigation.left"
                    @right="navigation.right"
                    @select="navigation.select"/>

                <FluxButtonStack :class="$style.row">
                    <FluxSecondaryButton icon-leading="house" label="Home" @click="navigation.home"/>
                    <FluxSecondaryButton icon-leading="rectangle-vertical-history" label="Top Menu" @click="navigation.topMenu"/>
                    <FluxSecondaryButton icon-leading="angle-left" label="Menu / Back" @click="navigation.menu"/>
                </FluxButtonStack>

                <FluxDivider/>

                <FluxMenuSubHeader label="Playback"/>
                <FluxButtonStack>
                    <FluxSecondaryButton icon-leading="backward-fast" @click="seekActions.skipBackward(15)"/>
                    <FluxSecondaryButton icon-leading="backward" @click="playbackControls.previous"/>
                    <FluxPrimaryButton
                        :icon-leading="playbackState.isPlaying.value ? 'circle-pause' : 'circle-play'"
                        @click="playbackControls.playPause"/>
                    <FluxSecondaryButton icon-leading="forward" @click="playbackControls.next"/>
                    <FluxSecondaryButton icon-leading="forward-fast" @click="seekActions.skipForward(15)"/>
                    <FluxSecondaryButton icon-leading="stop" @click="playbackControls.stop"/>
                </FluxButtonStack>

                <FluxDivider/>

                <FluxMenuSubHeader label="Gestures"/>
                <FluxButtonStack>
                    <FluxSecondaryButton label="Swipe Up" @click="gestures.swipe('up')"/>
                    <FluxSecondaryButton label="Swipe Down" @click="gestures.swipe('down')"/>
                    <FluxSecondaryButton label="Swipe Left" @click="gestures.swipe('left')"/>
                    <FluxSecondaryButton label="Swipe Right" @click="gestures.swipe('right')"/>
                    <FluxSecondaryButton label="Tap (center)" @click="gestures.tap(200, 200)"/>
                </FluxButtonStack>

                <FluxDivider/>

                <FluxMenuSubHeader label="Power"/>
                <FluxButtonStack>
                    <FluxSecondaryButton icon-leading="power-off" label="Wake" @click="powerRemote.wake"/>
                    <FluxDestructiveButton icon-leading="power-off" label="Suspend" @click="powerRemote.suspend"/>
                    <FluxSecondaryButton icon-leading="moon" label="Toggle" @click="powerRemote.toggle"/>
                </FluxButtonStack>

                <FluxDivider/>

                <FluxMenuSubHeader label="System"/>
                <FluxButtonStack>
                    <FluxSecondaryButton label="Captions" @click="systemActions.toggleCaptions"/>
                    <FluxSecondaryButton icon-leading="moon" label="Dark" @click="systemActions.setAppearance('dark')"/>
                    <FluxSecondaryButton icon-leading="sun" label="Light" @click="systemActions.setAppearance('light')"/>
                    <FluxSecondaryButton icon-leading="microphone" label="Siri Start" @click="systemActions.siriStart"/>
                    <FluxSecondaryButton label="Siri Stop" @click="systemActions.siriStop"/>
                    <FluxSecondaryButton label="Find Remote" @click="systemActions.findRemote(true)"/>
                </FluxButtonStack>

                <FluxDivider/>

                <FluxMenuSubHeader label="Text Input"/>
                <FluxFormField label="Text">
                    <FluxFormInput v-model="textValue" placeholder="Type to send"/>
                </FluxFormField>
                <FluxButtonStack>
                    <FluxSecondaryButton label="Set" @click="onSetText"/>
                    <FluxSecondaryButton label="Append" @click="onAppendText"/>
                    <FluxDestructiveButton label="Clear" @click="text.clear"/>
                </FluxButtonStack>
            </FluxPaneBody>
        </FluxPane>

        <FluxPane v-if="isConnected && metadata.isAppleTV.value">
            <FluxPaneHeader title="Apps">
                <template #actions>
                    <FluxSecondaryButton
                        icon-leading="arrows-rotate"
                        label="Refresh"
                        :is-disabled="apps.isLoading.value"
                        @click="apps.refresh"/>
                </template>
            </FluxPaneHeader>
            <FluxPaneBody>
                <FluxNotice v-if="apps.error.value" type="danger" :message="apps.error.value"/>
                <FluxPlaceholder
                    v-else-if="apps.apps.value.length === 0"
                    icon="list"
                    title="No apps loaded"
                    description="Click Refresh to fetch the launchable apps."/>
                <FluxItemStack v-else>
                    <FluxItem
                        v-for="app of apps.apps.value"
                        :key="app.bundleId"
                        @click="() => apps.launch(app.bundleId)">
                        <FluxItemContent :title="app.name" :subtitle="app.bundleId"/>
                    </FluxItem>
                </FluxItemStack>
            </FluxPaneBody>
        </FluxPane>

        <FluxPane v-if="isConnected && metadata.isAppleTV.value">
            <FluxPaneHeader title="Users">
                <template #actions>
                    <FluxSecondaryButton
                        icon-leading="arrows-rotate"
                        label="Refresh"
                        :is-disabled="users.isLoading.value"
                        @click="users.refresh"/>
                </template>
            </FluxPaneHeader>
            <FluxPaneBody>
                <FluxNotice v-if="users.error.value" type="danger" :message="users.error.value"/>
                <FluxPlaceholder
                    v-else-if="users.users.value.length === 0"
                    icon="user-group"
                    title="No users loaded"
                    description="Click Refresh to fetch the user accounts."/>
                <FluxItemStack v-else>
                    <FluxItem
                        v-for="user of users.users.value"
                        :key="user.accountId"
                        @click="() => users.switchTo(user.accountId)">
                        <FluxItemMedia>
                            <FluxIcon name="user"/>
                        </FluxItemMedia>
                        <FluxItemContent :title="user.name" :subtitle="user.accountId"/>
                    </FluxItem>
                </FluxItemStack>
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
        FluxDivider,
        FluxFormField,
        FluxFormInput,
        FluxIcon,
        FluxItem,
        FluxItemContent,
        FluxItemMedia,
        FluxItemStack,
        FluxMenuSubHeader,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPlaceholder,
        FluxPrimaryButton,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { ref } from 'vue';
    import ClickWheel from '@renderer/component/ClickWheel.vue';
    import { useDeviceConnection } from '@renderer/composable/device';
    import { usePlaybackControls, useSeek } from '@renderer/composable/playback';
    import { useDeviceMetadata, usePlaybackState } from '@renderer/composable/state';
    import { defineTitle } from '@renderer/composable/ui';
    import {
        useRemoteApps,
        useRemoteGestures,
        useRemoteNavigation,
        useRemotePower,
        useRemoteSystem,
        useRemoteText,
        useRemoteUsers
    } from '@renderer/composable/remote';

    defineTitle('circle-dot', 'Remote');

    const {isConnected} = useDeviceConnection();
    const metadata = useDeviceMetadata();
    const navigation = useRemoteNavigation();
    const gestures = useRemoteGestures();
    const text = useRemoteText();
    const powerRemote = useRemotePower();
    const systemActions = useRemoteSystem();
    const apps = useRemoteApps();
    const users = useRemoteUsers();
    const playbackControls = usePlaybackControls();
    const playbackState = usePlaybackState();
    const seekActions = useSeek();

    const textValue = ref('');

    async function onSetText(): Promise<void> {
        await text.set(textValue.value);
    }

    async function onAppendText(): Promise<void> {
        await text.append(textValue.value);
    }
</script>

<style
    lang="scss"
    module>
    .row {
        justify-content: center;
    }
</style>
