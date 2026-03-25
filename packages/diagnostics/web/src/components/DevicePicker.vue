<template>
    <div class="sidebar-section">
        <div class="section-header">
            <span
                class="status-dot"
                :class="wsConnected ? 'connected' : 'disconnected'"/>

            <h3>Devices</h3>

            <FluxButtonGroup v-if="!connectedDevice">
                <FluxSecondaryButton
                    icon-leading="arrows-rotate"
                    :is-loading="discovering"
                    @click="emit('discover')"/>

                <FluxSecondaryButton
                    icon-leading="key"
                    @click="emit('pair')"/>
            </FluxButtonGroup>
        </div>

        <div
            v-if="connectedDevice"
            class="section-body"
            style="display: flex; align-items: center; gap: 12px;">
            <DeviceIcon :type="connectedDevice.type"/>
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; font-weight: 600;">
                    {{ connectedDevice.name }}
                </div>
                <div style="font-size: 11px; color: var(--foreground-secondary);">
                    {{ connectedDevice.model }} &middot; {{ connectedDevice.address }}
                </div>
            </div>
            <FluxDestructiveButton
                icon-leading="link-broken"
                size="small"
                @click="emit('disconnect')"/>
        </div>

        <template v-else>
            <div class="device-list">
                <button
                    v-for="device in devices"
                    :key="device.id"
                    class="device-item"
                    :disabled="connecting"
                    @click="emit('connect', device.id)">
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
                    v-if="devices.length === 0 && !discovering"
                    class="empty-state">
                    No devices found
                </div>
            </div>

            <div class="section-body">
                <div class="input-group">
                    <FluxFormInput
                        v-model="ipInput"
                        type="text"
                        placeholder="IP address..."
                        :disabled="connecting"
                        is-condensed
                        @keydown.enter="handleConnectIp"/>

                    <FluxSecondaryButton
                        label="Connect"
                        :disabled="!ipInput || connecting"
                        @click="handleConnectIp"/>
                </div>
            </div>
        </template>
    </div>
</template>

<script
    setup
    lang="ts">
    import { onMounted, ref } from 'vue';
    import { FluxButtonGroup, FluxDestructiveButton, FluxFormInput, FluxSecondaryButton, FluxTag } from '@flux-ui/components';
    import type { DeviceInfo } from '../composables/useWebSocket';
    import DeviceIcon from './DeviceIcon.vue';

    defineProps<{
        devices: DeviceInfo[];
        discovering: boolean;
        connecting: boolean;
        connectedDevice: DeviceInfo | null;
        wsConnected: boolean;
    }>();

    const emit = defineEmits<{
        discover: [];
        connect: [deviceId: string];
        connectIp: [address: string];
        disconnect: [];
        pair: [];
    }>();

    const ipInput = ref('');

    const handleConnectIp = () => {
        if (ipInput.value) {
            emit('connectIp', ipInput.value);
            ipInput.value = '';
        }
    };

    onMounted(() => {
        emit('discover');
    });
</script>
