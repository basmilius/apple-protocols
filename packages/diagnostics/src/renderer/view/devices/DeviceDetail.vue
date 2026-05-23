<template>
    <FluxApplicationContent layout="full">
        <template v-if="device">
            <FluxNotice
                v-if="needsPairing"
                type="warning"
                message="This Apple TV needs AirPlay pairing before it can connect. Use the menu on the left to pair."/>

            <div :class="$style.deviceDetailMainTop">
                <NowPlayingCard :class="$style.deviceDetailNowPlaying"/>
                <RemotePanel :class="$style.deviceDetailRemote"/>
            </div>

            <LogConsole/>
        </template>

        <FluxPane v-else>
            <FluxPaneBody>
                <FluxPlaceholder
                    icon="circle"
                    title="Device not found"
                    description="The selected device is no longer available. Scan again to refresh the list."/>
            </FluxPaneBody>
        </FluxPane>
    </FluxApplicationContent>
</template>

<script
    lang="ts"
    setup>
    import type { FluxIconName } from '@flux-ui/types';
    import { FluxApplicationContent } from '@flux-ui/application';
    import {
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPlaceholder
    } from '@flux-ui/components';
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';
    import LogConsole from '@renderer/component/LogConsole.vue';
    import NowPlayingCard from '@renderer/component/NowPlayingCard.vue';
    import RemotePanel from '@renderer/component/RemotePanel.vue';
    import { useDeviceDiscovery } from '@renderer/composable/device';
    import { defineTitle } from '@renderer/composable/ui';

    const route = useRoute();
    const {devices} = useDeviceDiscovery();

    const deviceId = computed(() => {
        const id = route.params.deviceId;
        return typeof id === 'string' ? id : null;
    });

    const device = computed(() => {
        const id = deviceId.value;
        if (!id) {
            return null;
        }
        return devices.value.find(d => d.id === id) ?? null;
    });

    const needsPairing = computed(() => {
        if (!device.value || device.value.type !== 'appletv') {
            return false;
        }
        return !device.value.paired.includes('airplay');
    });

    const titleRef = computed(() => device.value?.name);
    const iconRef = computed<FluxIconName>(() => {
        switch (device.value?.type) {
            case 'appletv': return 'tv';
            case 'homepod':
            case 'homepod-mini': return 'computer-speaker';
            default: return 'circle';
        }
    });

    defineTitle(iconRef.value, titleRef);
</script>

<style
    lang="scss"
    module>
    .deviceDetailMainTop {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 16px;
        align-items: stretch;
    }

    .deviceDetailNowPlaying,
    .deviceDetailRemote {
        min-width: 0;
    }
</style>
