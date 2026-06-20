<template>
    <FluxRoot>
        <div class="sidebar">
            <div class="sidebar-tabs">
                <FluxSegmentedControl
                    v-model="sidebarTab"
                    is-fill>
                    <FluxSegmentedControlItem :value="0" icon="radar" label="Devices"/>
                    <FluxSegmentedControlItem :value="1" icon="display" label="Device"/>
                    <FluxSegmentedControlItem :value="2" icon="network-wired" label="Network"/>
                </FluxSegmentedControl>
            </div>

            <div class="sidebar-content">
                <!-- Tab: Devices -->
                <template v-if="sidebarTab === 0">
                    <DevicePicker
                        :devices="devices"
                        :discovering="discovering"
                        :connecting="connecting"
                        :connected-device="state.device"
                        :ws-connected="wsConnected"
                        @discover="discover"
                        @connect="connectDevice"
                        @connect-ip="connectByIp"
                        @disconnect="disconnectDevice"
                        @pair="openPairing"/>
                </template>

                <!-- Tab: Device -->
                <template v-if="sidebarTab === 1">
                    <AppAccountSwitcher
                        v-if="state.companionLink"
                        :companion-link-connected="state.companionLink?.connected === true"
                        :send-command="sendCommand"/>

                    <StatePanel :state="state"/>
                </template>

                <!-- Tab: Network -->
                <template v-if="sidebarTab === 2">
                    <MdnsScanPanel :scan-mdns="scanMdns"/>
                </template>
            </div>
        </div>

        <div class="main">
            <div class="main-top">
                <NowPlaying :now-playing="state.nowPlaying"/>

                <ToolsPanel
                    :connected="state.connected"
                    :is-apple-tv="state.device?.type === 'appletv'"
                    @command="(cmd: string, arg?: string) => sendCommand(cmd, arg)"/>

                <RemoteControl
                    :connected="state.connected"
                    :is-apple-tv="state.device?.type === 'appletv'"
                    @command="(cmd: string, arg?: string) => sendCommand(cmd, arg)"/>
            </div>

            <ConsoleLog
                :logs="logs"
                @clear="clearLogs"/>
        </div>

        <PairingDialog
            :is-visible="showPairingDialog || pairing.active || !!pairing.result"
            :devices="devices"
            :pairing="pairing"
            @start="handlePairStart"
            @submit-pin="submitPin"
            @cancel="cancelPairing"
            @dismiss="closePairing"/>
    </FluxRoot>
</template>

<script
    setup
    lang="ts">
    import { ref } from 'vue';
    import { FluxRoot, FluxSegmentedControl, FluxSegmentedControlItem } from '@flux-ui/components';
    import { useWebSocket } from './composables/useWebSocket';
    import { useDevice } from './composables/useDevice';
    import AppAccountSwitcher from './components/AppAccountSwitcher.vue';
    import DevicePicker from './components/DevicePicker.vue';
    import RemoteControl from './components/RemoteControl.vue';
    import ToolsPanel from './components/ToolsPanel.vue';
    import NowPlaying from './components/NowPlaying.vue';
    import StatePanel from './components/StatePanel.vue';
    import ConsoleLog from './components/ConsoleLog.vue';
    import MdnsScanPanel from './components/MdnsScanPanel.vue';
    import PairingDialog from './components/PairingDialog.vue';

    const {logs, state, wsConnected, pairing, clearLogs, dismissPairingResult} = useWebSocket();
    const {devices, discovering, connecting, discover, connectDevice, connectByIp, disconnectDevice, sendCommand, startPairing, submitPin, cancelPairing, scanMdns} = useDevice();

    const sidebarTab = ref(0);

    const showPairingDialog = ref(false);

    const openPairing = () => {
        dismissPairingResult();
        showPairingDialog.value = true;
    };

    const closePairing = () => {
        showPairingDialog.value = false;
        dismissPairingResult();
    };

    const handlePairStart = (deviceId: string, protocol: 'airplay' | 'companionLink') => {
        startPairing(deviceId, protocol);
    };
</script>
