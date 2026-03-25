<script
    setup
    lang="ts">
    import { onMounted, ref } from 'vue';
    import type { DeviceInfo } from '../composables/useWebSocket';
    import DeviceIcon from './DeviceIcon.vue';

    const props = defineProps<{
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

<template>
    <div
        class="sidebar-section"
        :class="{'has-scroll': !connectedDevice}">
        <h3>
            <span
                class="status-dot"
                :class="wsConnected ? 'connected' : 'disconnected'"></span>
            Devices
        </h3>

        <div
            v-if="connectedDevice"
            style="padding: 0 16px 16px;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                {{ connectedDevice.name }}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
                {{ connectedDevice.model }} &middot; {{ connectedDevice.address }}
            </div>
            <button
                class="btn btn-danger btn-sm"
                @click="emit('disconnect')">
                Disconnect
            </button>
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
                    v-if="devices.length === 0 && !discovering"
                    class="empty-state">
                    No devices found
                </div>
            </div>

            <div class="sidebar-section-footer">
                <div class="input-group"
                     style="margin-bottom: 4px;">
                    <input
                        v-model="ipInput"
                        class="text-input"
                        type="text"
                        placeholder="IP address..."
                        :disabled="connecting"
                        @keydown.enter="handleConnectIp">
                    <button
                        class="btn btn-sm"
                        :disabled="!ipInput || connecting"
                        @click="handleConnectIp">
                        Connect
                    </button>
                </div>

                <div style="display: flex; gap: 4px;">
                    <button
                        class="btn btn-sm"
                        style="flex: 1;"
                        :disabled="discovering"
                        @click="emit('discover')">
                        {{ discovering ? 'Scanning...' : 'Scan' }}
                    </button>
                    <button
                        class="btn btn-sm"
                        style="flex: 1;"
                        @click="emit('pair')">
                        Pair
                    </button>
                </div>
            </div>
        </template>
    </div>
</template>
