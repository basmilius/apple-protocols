<template>
    <FluxApplicationContent layout="default">
        <FluxPane>
            <FluxPaneHeader title="Multi-Room" subtitle="Stream audio to multiple AirPlay devices simultaneously"/>
        <FluxPaneBody>
            <FluxNotice
                type="info"
                message="Start the NTP timing server (Timing tab) before preparing multi-room targets."/>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane>
        <FluxPaneHeader title="Targets">
            <template #actions>
                <FluxSecondaryButton
                    icon-leading="arrows-rotate"
                    label="Rescan devices"
                    @click="discovery.scan"/>

                <FluxPrimaryButton
                    icon-leading="signal-stream"
                    label="Prepare selected"
                    :is-disabled="selectedDeviceIds.size < 2"
                    @click="onPrepare"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxNotice v-if="multiRoom.error.value" type="danger" :message="multiRoom.error.value"/>

            <FluxItemStack>
                <FluxItem
                    v-for="device of airplayDevices"
                    :key="device.id">
                    <FluxItemMedia>
                        <FluxCheckbox
                            :model-value="selectedDeviceIds.has(device.id)"
                            @update:model-value="(v: boolean) => onToggle(device.id, v)"/>
                    </FluxItemMedia>
                    <FluxItemContent :title="device.name" :subtitle="device.model"/>
                    <FluxItemActions>
                        <FluxTag
                            v-if="targetStatus(device.id)"
                            :label="targetStatus(device.id)!"
                            :color="targetColor(device.id)"/>
                    </FluxItemActions>
                </FluxItem>
            </FluxItemStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane v-if="multiRoom.targets.value.length > 0">
        <FluxPaneHeader title="Stream"/>
        <FluxPaneBody>
            <FluxFormField label="URL">
                <FluxFormInput v-model="streamUrlValue" placeholder="https://bmcdn.nl/doorbell.wav"/>
            </FluxFormField>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Stream URL"
                    :is-disabled="!streamUrlValue || multiRoom.isStreaming.value"
                    @click="onStreamUrl"/>
                <FluxSecondaryButton
                    icon-leading="folder-open"
                    label="Stream file…"
                    :is-disabled="multiRoom.isStreaming.value"
                    @click="onStreamFile"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!multiRoom.isStreaming.value"
                    @click="multiRoom.stop"/>
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
        FluxCheckbox,
        FluxDestructiveButton,
        FluxFormField,
        FluxFormInput,
        FluxItem,
        FluxItemActions,
        FluxItemContent,
        FluxItemMedia,
        FluxItemStack,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPrimaryButton,
        FluxSecondaryButton,
        FluxTag
    } from '@flux-ui/components';
    import { computed, onMounted, reactive, ref } from 'vue';
    import { useDeviceDiscovery } from '@renderer/composable/device';
    import { useAudioFile, useMultiRoom } from '@renderer/composable/media';
    import { defineTitle } from '@renderer/composable/ui';
    import type { MultiRoomTargetStatus } from '@shared/snapshots';

    defineTitle('signal-stream', 'Multi-Room');

    const discovery = useDeviceDiscovery();
    const multiRoom = useMultiRoom();
    const audioFile = useAudioFile();

    const selectedDeviceIds = reactive(new Set<string>());
    const streamUrlValue = ref('');

    const airplayDevices = computed(() =>
        discovery.devices.value.filter(d => d.protocols.includes('airplay'))
    );

    function onToggle(id: string, value: boolean): void {
        if (value) {
            selectedDeviceIds.add(id);
        } else {
            selectedDeviceIds.delete(id);
        }
    }

    function targetStatus(deviceId: string): MultiRoomTargetStatus | null {
        return multiRoom.targets.value.find(t => t.deviceId === deviceId)?.status ?? null;
    }

    function targetColor(deviceId: string): 'primary' | 'gray' | 'danger' {
        const status = targetStatus(deviceId);
        if (status === 'ok') return 'primary';
        if (status === 'failed') return 'danger';
        return 'gray';
    }

    async function onPrepare(): Promise<void> {
        await multiRoom.prepare(Array.from(selectedDeviceIds));
    }

    async function onStreamUrl(): Promise<void> {
        await multiRoom.streamUrl(streamUrlValue.value);
    }

    async function onStreamFile(): Promise<void> {
        const file = await audioFile.pickFile();
        if (!file) {
            return;
        }
        await multiRoom.streamFile(file.path);
    }

    onMounted(() => {
        if (discovery.devices.value.length === 0) {
            void discovery.scan();
        }
        void multiRoom.refreshTargets();
    });
</script>
