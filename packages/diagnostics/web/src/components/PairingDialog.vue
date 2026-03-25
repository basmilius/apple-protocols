<template>
    <FluxOverlay is-closeable @close="emit('dismiss')">
        <FluxPane
            v-if="isVisible"
            style="width: 400px; max-width: 90vw; max-height: 80vh;">
            <!-- Result -->
            <template v-if="pairing.result">
                <FluxPaneHeader :title="pairing.result.success ? 'Pairing Successful' : 'Pairing Failed'"/>

                <FluxPaneBody>
                    <p v-if="pairing.result.success"
                       style="font-size: 13px; color: var(--success-500);">
                        Credentials have been saved. You can now connect to this device.
                    </p>
                    <p v-else
                       style="font-size: 13px; color: var(--danger-500);">
                        {{ pairing.result.error }}
                    </p>
                </FluxPaneBody>

                <FluxPaneFooter>
                    <FluxSecondaryButton
                        label="Close"
                        @click="emit('dismiss')"/>
                </FluxPaneFooter>
            </template>

            <!-- Waiting for PIN -->
            <template v-else-if="pairing.waitingForPin">
                <FluxPaneHeader title="Enter PIN"/>

                <FluxPaneBody>
                    <p style="font-size: 13px; color: var(--foreground-secondary); margin-bottom: 12px;">
                        A PIN code is shown on <strong>{{ pairing.deviceName }}</strong>. Enter it below.
                    </p>

                    <input
                        v-model="pin"
                        class="pin-input"
                        type="text"
                        inputmode="numeric"
                        placeholder="0000"
                        autofocus
                        @keydown.enter="handleSubmitPin">
                </FluxPaneBody>

                <FluxPaneFooter>
                    <FluxSecondaryButton
                        label="Cancel"
                        @click="emit('cancel')"/>
                    <FluxPrimaryButton
                        label="Submit"
                        :disabled="pin.length === 0"
                        @click="handleSubmitPin"/>
                </FluxPaneFooter>
            </template>

            <!-- Pairing in progress -->
            <template v-else-if="pairing.active">
                <FluxPaneHeader title="Pairing"/>

                <FluxPaneBody>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <FluxSpinner/>
                        <span style="font-size: 13px; color: var(--foreground-secondary);">
                            Connecting to <strong>{{ pairing.deviceName }}</strong> ({{ pairing.protocol }})...
                        </span>
                    </div>
                </FluxPaneBody>

                <FluxPaneFooter>
                    <FluxSecondaryButton
                        label="Cancel"
                        @click="emit('cancel')"/>
                </FluxPaneFooter>
            </template>

            <!-- Select device & protocol -->
            <template v-else>
                <FluxPaneHeader title="Pair Device"/>

                <FluxPaneBody>
                    <p style="font-size: 13px; color: var(--foreground-secondary); margin-bottom: 12px;">
                        Select a device and protocol to pair.
                    </p>

                    <FluxButtonGroup style="margin-bottom: 12px;">
                        <FluxSecondaryButton
                            label="AirPlay"
                            :is-filled="selectedProtocol === 'airplay'"
                            @click="selectedProtocol = 'airplay'"/>
                        <FluxSecondaryButton
                            label="Companion Link"
                            :is-filled="selectedProtocol === 'companionLink'"
                            @click="selectedProtocol = 'companionLink'"/>
                    </FluxButtonGroup>
                </FluxPaneBody>

                <div class="device-list" style="max-height: 40dvh; border-top: 1px solid var(--surface-stroke); border-bottom: 1px solid var(--surface-stroke);">
                    <button
                        v-for="device in devices"
                        :key="device.id"
                        class="device-item"
                        @click="emit('start', device.id, selectedProtocol)">
                        <DeviceIcon :type="device.type"/>
                        <span class="device-name">{{ device.name }}</span>
                        <span class="device-protocols">
                            <FluxTag
                                v-for="proto in device.protocols"
                                :key="proto"
                                :label="proto === 'airplay' ? 'AP' : 'CL'"
                                :color="device.paired.includes(proto) ? 'success' : 'gray'"/>
                        </span>
                    </button>

                    <div
                        v-if="devices.length === 0"
                        class="empty-state">
                        No devices found. Scan first.
                    </div>
                </div>

                <FluxPaneFooter>
                    <FluxSecondaryButton
                        label="Cancel"
                        @click="emit('dismiss')"/>
                </FluxPaneFooter>
            </template>
        </FluxPane>
    </FluxOverlay>
</template>

<script
    setup
    lang="ts">
    import { ref } from 'vue';
    import { FluxButtonGroup, FluxOverlay, FluxPane, FluxPaneBody, FluxPaneFooter, FluxPaneHeader, FluxPrimaryButton, FluxSecondaryButton, FluxSpinner, FluxTag } from '@flux-ui/components';
    import type { DeviceInfo, PairingState } from '../composables/useWebSocket';
    import DeviceIcon from './DeviceIcon.vue';

    defineProps<{
        isVisible: boolean;
        devices: DeviceInfo[];
        pairing: PairingState;
    }>();

    const emit = defineEmits<{
        start: [deviceId: string, protocol: 'airplay' | 'companionLink'];
        submitPin: [pin: string];
        cancel: [];
        dismiss: [];
    }>();

    const pin = ref('');
    const selectedProtocol = ref<'airplay' | 'companionLink'>('airplay');

    const handleSubmitPin = () => {
        if (pin.value.length > 0) {
            emit('submitPin', pin.value);
            pin.value = '';
        }
    };
</script>
