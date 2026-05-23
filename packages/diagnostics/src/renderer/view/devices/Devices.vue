<template>
    <FluxApplicationContent layout="medium">
        <FluxPane>
            <FluxPaneHeader title="Devices" subtitle="Discovered Apple TVs and HomePods on your network">
                <template #actions>
                    <FluxSecondaryButton
                        icon-leading="arrows-rotate"
                        label="Scan"
                        :is-disabled="isScanning"
                        @click="scan"/>

                    <FluxSecondaryButton
                        icon-leading="radar"
                        label="Rescan"
                        :is-disabled="isScanning"
                        @click="rescan"/>
                </template>
            </FluxPaneHeader>

            <FluxPaneBody>
                <FluxNotice
                    v-if="error"
                    type="danger"
                    :message="error"/>

                <FluxPlaceholder
                    v-else-if="devices.length === 0 && !isScanning"
                    icon="radar"
                    title="No devices found"
                    description="Click Scan to discover devices on your network."/>

                <FluxItemStack>
                    <FluxItem
                        v-for="device of devices"
                        :key="device.id">
                        <FluxItemMedia>
                            <FluxIcon :name="iconFor(device.type)" size="lg"/>
                        </FluxItemMedia>

                        <FluxItemContent>
                            <strong>{{ device.name }}</strong>
                            <p>{{ device.model }} · {{ device.address }}</p>
                        </FluxItemContent>

                        <FluxItemActions>
                            <FluxTagStack>
                                <FluxTag
                                    v-for="protocol of device.protocols"
                                    :key="protocol"
                                    :label="protocolLabel(protocol)"
                                    :color="device.paired.includes(protocol) ? 'primary' : 'gray'"/>
                            </FluxTagStack>

                            <FluxSecondaryButton
                                v-if="needsPairing(device)"
                                icon-leading="link-simple"
                                label="Pair"
                                @click="onPair(device)"/>

                            <FluxPrimaryButton
                                icon-leading="angle-right"
                                label="Open"
                                @click="onOpen(device)"/>
                        </FluxItemActions>
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
        FluxIcon,
        FluxItem,
        FluxItemActions,
        FluxItemContent,
        FluxItemMedia,
        FluxItemStack,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPlaceholder,
        FluxPrimaryButton,
        FluxSecondaryButton,
        FluxTag,
        FluxTagStack
    } from '@flux-ui/components';
    import type { FluxIconName } from '@flux-ui/types';
    import { onMounted } from 'vue';
    import { useRouter } from 'vue-router';
    import { useDeviceConnection, useDeviceDiscovery } from '@renderer/composable/device';
    import { usePairingFlow } from '@renderer/composable/pairing';
    import { defineTitle } from '@renderer/composable/ui';
    import type { DeviceInfo, DeviceProtocol, DeviceType } from '@shared/snapshots';

    const router = useRouter();
    const {devices, isScanning, error, scan, rescan} = useDeviceDiscovery();
    const {snapshot, isConnected, connect} = useDeviceConnection();
    const {start: startPairing} = usePairingFlow();

    defineTitle('radar', 'Devices');

    function iconFor(type: DeviceType): FluxIconName {
        switch (type) {
            case 'appletv':
                return 'tv';
            case 'homepod':
            case 'homepod-mini':
                return 'computer-speaker';
            default:
                return 'circle';
        }
    }

    function protocolLabel(protocol: DeviceProtocol): string {
        return protocol === 'airplay' ? 'AirPlay' : 'Companion Link';
    }

    function needsPairing(device: DeviceInfo): boolean {
        return device.type === 'appletv' && !device.paired.includes('airplay');
    }

    async function onPair(device: DeviceInfo): Promise<void> {
        await startPairing(device.id, 'airplay');
    }

    async function onOpen(device: DeviceInfo): Promise<void> {
        await router.push({name: 'device-detail', params: {deviceId: device.id}});

        if (needsPairing(device)) {
            return;
        }

        if (snapshot.value.device?.id === device.id && isConnected.value) {
            return;
        }

        try {
            await connect(device.id);
        } catch {
            // Errors zijn zichtbaar via de connection store error state.
        }
    }

    onMounted(() => {
        if (devices.value.length === 0) {
            void scan();
        }
    });
</script>
