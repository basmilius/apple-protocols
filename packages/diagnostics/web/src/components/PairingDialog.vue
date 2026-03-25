<script
    setup
    lang="ts">
    import { ref } from 'vue';
    import type { DeviceInfo, PairingState } from '../composables/useWebSocket';
    import DeviceIcon from './DeviceIcon.vue';

    const props = defineProps<{
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

<template>
    <div class="dialog-overlay">
        <div class="dialog">
            <!-- Result -->
            <template v-if="pairing.result">
                <div class="dialog-header">
                    <h2>{{ pairing.result.success ? 'Pairing Successful' : 'Pairing Failed' }}</h2>
                </div>

                <div class="dialog-body">
                    <p v-if="pairing.result.success"
                       class="pairing-success">
                        Credentials have been saved. You can now connect to this device.
                    </p>
                    <p v-else
                       class="pairing-error">
                        {{ pairing.result.error }}
                    </p>
                </div>

                <div class="dialog-footer">
                    <button
                        class="btn"
                        @click="emit('dismiss')">
                        Close
                    </button>
                </div>
            </template>

            <!-- Waiting for PIN -->
            <template v-else-if="pairing.waitingForPin">
                <div class="dialog-header">
                    <h2>Enter PIN</h2>
                </div>

                <div class="dialog-body">
                    <p class="dialog-hint">
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
                </div>

                <div class="dialog-footer">
                    <button
                        class="btn"
                        @click="emit('cancel')">
                        Cancel
                    </button>
                    <button
                        class="btn btn-accent"
                        :disabled="pin.length === 0"
                        @click="handleSubmitPin">
                        Submit
                    </button>
                </div>
            </template>

            <!-- Pairing in progress (before PIN) -->
            <template v-else-if="pairing.active">
                <div class="dialog-header">
                    <h2>Pairing</h2>
                </div>

                <div class="dialog-body">
                    <p class="dialog-hint">
                        Connecting to <strong>{{ pairing.deviceName }}</strong> ({{ pairing.protocol }})...
                    </p>
                </div>

                <div class="dialog-footer">
                    <button
                        class="btn"
                        @click="emit('cancel')">
                        Cancel
                    </button>
                </div>
            </template>

            <!-- Start pairing: select device & protocol -->
            <template v-else>
                <div class="dialog-header">
                    <h2>Pair Device</h2>
                </div>

                <div class="dialog-body">
                    <p class="dialog-hint">Select a device and protocol to pair.</p>

                    <div class="pair-protocol-toggle">
                        <button
                            class="btn btn-sm"
                            :class="{active: selectedProtocol === 'airplay'}"
                            @click="selectedProtocol = 'airplay'">
                            AirPlay
                        </button>
                        <button
                            class="btn btn-sm"
                            :class="{active: selectedProtocol === 'companionLink'}"
                            @click="selectedProtocol = 'companionLink'">
                            Companion Link
                        </button>
                    </div>
                </div>

                <div class="device-list dialog-device-list">
                    <button
                        v-for="device in devices"
                        :key="device.id"
                        class="device-item"
                        @click="emit('start', device.id, selectedProtocol)">
                        <DeviceIcon :type="device.type"/>
                        <span class="device-name">{{ device.name }}</span>
                        <span class="device-protocols">
                            <span
                                v-for="proto in device.protocols"
                                :key="proto"
                                class="protocol-badge"
                                :class="{paired: device.paired.includes(proto)}">
                                {{ proto === 'airplay' ? 'AP' : 'CL' }}
                            </span>
                        </span>
                    </button>

                    <div
                        v-if="devices.length === 0"
                        class="empty-state">
                        No devices found. Scan first.
                    </div>
                </div>

                <div class="dialog-footer">
                    <button
                        class="btn"
                        @click="emit('dismiss')">
                        Cancel
                    </button>
                </div>
            </template>
        </div>
    </div>
</template>
