<template>
    <FluxApplicationMenuContext
        :icon="contextIcon"
        :title="device?.name ?? 'Device'"
        :subtitle="device?.model ?? ''"
        type="route"
        :to="{name: 'devices'}"/>

    <FluxMenuGroup>
        <FluxMenuItem
            icon-leading="rectangle-vertical-history"
            :is-active="route.name === 'device-detail'"
            label="Overview"
            :to="{name: 'device-detail', params: {deviceId}}"
            type="route"/>

        <FluxMenuItem
            v-if="isAppleTV"
            icon-leading="circle-dot"
            :is-active="route.name === 'device-remote'"
            :is-disabled="!isCurrent || !isConnected"
            label="Remote"
            :to="{name: 'device-remote', params: {deviceId}}"
            type="route"/>

        <FluxMenuItem
            icon-leading="file-music"
            :is-active="route.name === 'device-audio-playback'"
            :is-disabled="!isCurrent || !isConnected"
            label="Audio Playback"
            :to="{name: 'device-audio-playback', params: {deviceId}}"
            type="route"/>

        <FluxMenuItem
            icon-leading="key"
            :is-active="route.name === 'device-tools'"
            :is-disabled="!isCurrent || !isConnected"
            label="Tools"
            :to="{name: 'device-tools', params: {deviceId}}"
            type="route"/>
    </FluxMenuGroup>

    <FluxDivider/>

    <FluxMenuGroup
        v-if="device"
        label="Connection">
        <FluxMenuItem
            icon-leading="plug-circle-plus"
            label="Connect"
            :is-disabled="(isCurrent && isConnected) || !canConnect"
            @click="onConnect"/>

        <FluxMenuItem
            icon-leading="plug-circle-xmark"
            label="Disconnect"
            :is-disabled="!isCurrent || !isConnected"
            @click="onDisconnect"/>
    </FluxMenuGroup>

    <FluxDivider v-if="showPairingGroup"/>

    <FluxMenuGroup
        v-if="showPairingGroup"
        label="Pairing">
        <FluxMenuItem
            v-if="canPair && !pairedAirPlay"
            icon-leading="link-simple"
            label="Pair AirPlay"
            @click="onPairAirPlay"/>

        <FluxMenuItem
            v-if="canPair && device?.protocols.includes('companionLink') && !pairedCompanionLink"
            icon-leading="link-simple"
            label="Pair Companion Link"
            @click="onPairCompanionLink"/>

        <FluxMenuItem
            v-if="hasAnyPairing"
            icon-leading="link-simple-slash"
            label="Unpair device"
            @click="onUnpair"/>
    </FluxMenuGroup>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplicationMenuContext } from '@flux-ui/application';
    import { FluxDivider, FluxMenuGroup, FluxMenuItem, showConfirm } from '@flux-ui/components';
    import type { FluxIconName } from '@flux-ui/types';
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';
    import { useDeviceConnection, useDeviceDiscovery } from '@renderer/composable/device';
    import { usePairingFlow, useUnpair } from '@renderer/composable/pairing';

    const route = useRoute();
    const {devices} = useDeviceDiscovery();
    const {snapshot, isConnected, connect, disconnect} = useDeviceConnection();
    const {start: startPairing} = usePairingFlow();
    const {unpair} = useUnpair();

    const deviceId = computed<string>(() => {
        const id = route.params.deviceId;
        return typeof id === 'string' ? id : '';
    });

    const device = computed(() => {
        const id = deviceId.value;
        if (!id) {
            return null;
        }
        return devices.value.find(d => d.id === id) ?? null;
    });

    const isCurrent = computed(() => snapshot.value.device?.id === deviceId.value);
    const isAppleTV = computed(() => device.value?.type === 'appletv');
    const pairedAirPlay = computed(() => device.value?.paired.includes('airplay') ?? false);
    const pairedCompanionLink = computed(() => device.value?.paired.includes('companionLink') ?? false);
    const hasAnyPairing = computed(() => pairedAirPlay.value || pairedCompanionLink.value);

    const canConnect = computed(() => {
        if (!device.value) {
            return false;
        }
        if (device.value.type !== 'appletv') {
            return true;
        }
        return pairedAirPlay.value;
    });

    const canPair = computed(() => isAppleTV.value);
    const showPairingGroup = computed(() => canPair.value || hasAnyPairing.value);

    const contextIcon = computed<FluxIconName>(() => {
        switch (device.value?.type) {
            case 'appletv':
                return 'tv';
            case 'homepod':
            case 'homepod-mini':
                return 'computer-speaker';
            default:
                return 'circle';
        }
    });

    async function onConnect(): Promise<void> {
        if (!deviceId.value) {
            return;
        }
        await connect(deviceId.value);
    }

    async function onDisconnect(): Promise<void> {
        await disconnect();
    }

    async function onPairAirPlay(): Promise<void> {
        if (!deviceId.value) {
            return;
        }
        await startPairing(deviceId.value, 'airplay');
    }

    async function onPairCompanionLink(): Promise<void> {
        if (!deviceId.value) {
            return;
        }
        await startPairing(deviceId.value, 'companionLink');
    }

    async function onUnpair(): Promise<void> {
        if (!deviceId.value) {
            return;
        }

        const ok = await showConfirm({
            title: 'Unpair device?',
            message: `Removes all stored credentials for ${device.value?.name ?? 'this device'}. You will need to pair again to reconnect.`,
            icon: 'link-simple-slash'
        });

        if (!ok) {
            return;
        }

        if (pairedAirPlay.value) {
            await unpair(deviceId.value, 'airplay');
        }
        if (pairedCompanionLink.value) {
            await unpair(deviceId.value, 'companionLink');
        }
    }
</script>
