<template>
    <FluxApplicationContent layout="dashboard">
        <FluxPane>
            <FluxPaneHeader title="NTP Timing Server">
            <template #actions>
                <FluxTag
                    :label="ntp.state.value.running ? `Running on :${ntp.state.value.port}` : 'Stopped'"
                    :color="ntp.state.value.running ? 'primary' : 'gray'"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Start"
                    :is-disabled="ntp.state.value.running"
                    @click="ntp.start"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!ntp.state.value.running"
                    @click="ntp.stop"/>
            </FluxButtonStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane>
        <FluxPaneHeader title="PTP Master">
            <template #actions>
                <FluxTag
                    :label="ptp.state.value.running ? `Master · peer ${ptp.state.value.peerAddress}` : 'Stopped'"
                    :color="ptp.state.value.running ? 'primary' : 'gray'"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxFormField label="Peer address">
                <FluxFormInput v-model="ptpAddress" placeholder="192.168.1.10"/>
            </FluxFormField>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="play"
                    label="Start"
                    :is-disabled="!ptpAddress || ptp.state.value.running"
                    @click="onStartPtp"/>
                <FluxDestructiveButton
                    icon-leading="stop"
                    label="Stop"
                    :is-disabled="!ptp.state.value.running"
                    @click="ptp.stop"/>
            </FluxButtonStack>

            <FluxInfoStack v-if="ptp.state.value.running">
                <FluxInfo label="Clock identity" :value="ptp.state.value.clockIdentity ?? '—'"/>
                <FluxInfo label="Event port" :value="String(ptp.state.value.eventPort ?? '—')"/>
                <FluxInfo label="General port" :value="String(ptp.state.value.generalPort ?? '—')"/>
                <FluxInfo label="State" :value="ptp.state.value.state ?? '—'"/>
                <FluxInfo label="Syncs sent" :value="String(ptp.state.value.syncsSent)"/>
                <FluxInfo label="Announces sent" :value="String(ptp.state.value.announcesSent)"/>
                <FluxInfo label="DelayReqs received" :value="String(ptp.state.value.delayReqsReceived)"/>
                <FluxInfo label="DelayResps sent" :value="String(ptp.state.value.delayRespsSent)"/>
                <FluxInfo label="Announces received" :value="String(ptp.state.value.announcesReceived)"/>
            </FluxInfoStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane>
        <FluxPaneHeader title="Receiver inspection">
            <template #actions>
                <FluxSecondaryButton
                    icon-leading="magnifying-glass"
                    label="Inspect all"
                    :is-disabled="inspect.isInspecting.value"
                    @click="inspect.inspect"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxNotice v-if="inspect.error.value" type="danger" :message="inspect.error.value"/>

            <FluxPlaceholder
                v-if="inspect.entries.value.length === 0"
                icon="magnifying-glass"
                title="No inspection results"
                description="Run inspection to see PTP/NTP support per receiver."/>

            <FluxItemStack v-else>
                <FluxItem v-for="entry of inspect.entries.value" :key="entry.id">
                    <FluxItemContent
                        :title="entry.name"
                        :subtitle="`${entry.model} · ${entry.address}:${entry.port} · features ${entry.features}`"/>
                    <FluxItemActions>
                        <FluxTag
                            :label="entry.strategy"
                            :color="entry.strategy === 'PTP' ? 'primary' : entry.strategy === 'NTP' ? 'info' : 'gray'"/>
                    </FluxItemActions>
                </FluxItem>
            </FluxItemStack>
        </FluxPaneBody>
    </FluxPane>

    <FluxPane>
        <FluxPaneHeader title="Flow test"/>
        <FluxPaneBody>
            <FluxFormField label="Device">
                <FluxFormSelect v-model="flowDeviceId" :options="deviceOptions"/>
            </FluxFormField>

            <FluxFormField label="Mode">
                <FluxFormSelect v-model="flowMode" :options="modeOptions"/>
            </FluxFormField>

            <FluxNotice v-if="flow.error.value" type="danger" :message="flow.error.value"/>

            <FluxButtonStack>
                <FluxPrimaryButton
                    icon-leading="signal-stream"
                    label="Run flow"
                    :is-disabled="!flowDeviceId || flow.isRunning.value"
                    @click="onRunFlow"/>
            </FluxButtonStack>

            <FluxInfoStack v-if="flow.report.value">
                <FluxInfo label="Device" :value="flow.report.value.deviceName"/>
                <FluxInfo label="Mode" :value="flow.report.value.mode"/>
                <FluxInfo label="Receiver features" :value="flow.report.value.receiverFeatures"/>
                <FluxInfo label="Supports PTP" :value="flow.report.value.supportsPTP ? 'Yes' : 'No'"/>
                <FluxInfo label="Selected strategy" :value="flow.report.value.selectedStrategy"/>
                <FluxInfo label="Predicted negotiation" :value="flow.report.value.predictedNegotiation"/>
                <FluxInfo
                    v-if="flow.report.value.timingServerPort !== null"
                    label="NTP port"
                    :value="String(flow.report.value.timingServerPort)"/>
                <FluxInfo
                    v-if="flow.report.value.ptpEventPort !== null"
                    label="PTP event port"
                    :value="String(flow.report.value.ptpEventPort)"/>
                <FluxInfo
                    v-if="flow.report.value.ptpGeneralPort !== null"
                    label="PTP general port"
                    :value="String(flow.report.value.ptpGeneralPort)"/>
                <FluxInfo
                    v-if="flow.report.value.ptpClockIdentity"
                    label="PTP clock identity"
                    :value="flow.report.value.ptpClockIdentity"/>
            </FluxInfoStack>
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
        FluxFormField,
        FluxFormInput,
        FluxFormSelect,
        FluxInfo,
        FluxInfoStack,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPlaceholder,
        FluxPrimaryButton,
        FluxSecondaryButton,
        FluxTag,
        FluxItem,
        FluxItemActions,
        FluxItemContent,
        FluxItemStack
    } from '@flux-ui/components';
    import { computed, onMounted, ref } from 'vue';
    import { useDeviceDiscovery } from '@renderer/composable/device';
    import { useNtpServer, usePtpMaster, useTimingFlow, useTimingInspect } from '@renderer/composable/timing';
    import { defineTitle } from '@renderer/composable/ui';
    import type { TimingFlowMode } from '@shared/snapshots';

    defineTitle('clock', 'Timing');

    const ntp = useNtpServer();
    const ptp = usePtpMaster();
    const inspect = useTimingInspect();
    const flow = useTimingFlow();
    const discovery = useDeviceDiscovery();

    const ptpAddress = ref('');
    const flowDeviceId = ref('');
    const flowMode = ref<TimingFlowMode>('auto');

    const deviceOptions = computed(() =>
        discovery.devices.value.map(d => ({label: `${d.name} (${d.address})`, value: d.id}))
    );

    const modeOptions: {label: string; value: TimingFlowMode}[] = [
        {label: 'Auto', value: 'auto'},
        {label: 'PTP', value: 'ptp'},
        {label: 'NTP', value: 'ntp'},
        {label: 'None', value: 'none'}
    ];

    async function onStartPtp(): Promise<void> {
        await ptp.start(ptpAddress.value);
    }

    async function onRunFlow(): Promise<void> {
        await flow.run(flowDeviceId.value, flowMode.value);
    }

    onMounted(() => {
        void ntp.refresh();
        void ptp.refresh();
        if (discovery.devices.value.length === 0) {
            void discovery.scan();
        }
    });
</script>
