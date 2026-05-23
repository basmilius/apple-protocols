<template>
    <FluxApplicationContent layout="dashboard">
        <FluxApplicationSection title="Multicast">
            <FluxPane>
                <FluxPaneHeader title="mDNS Multicast" subtitle="Broadcast a query to all interfaces">
                    <template #actions>
                        <FluxPrimaryButton
                            icon-leading="tower-broadcast"
                            label="Scan"
                            :is-disabled="multicast.isScanning.value"
                            @click="onMulticast"/>
                    </template>
                </FluxPaneHeader>
                <FluxPaneBody>
                    <FluxFormField label="Services (comma-separated)">
                        <FluxFormInput
                            v-model="multicastServices"
                            placeholder="_airplay._tcp.local"/>
                    </FluxFormField>

                    <FluxFormField label="Timeout (seconds)">
                        <FluxFormInput v-model.number="multicastTimeout" type="number" :min="1" :max="60"/>
                    </FluxFormField>

                    <FluxNotice v-if="multicast.error.value" type="danger" :message="multicast.error.value"/>

                    <FluxItemStack v-if="multicast.results.value.length > 0">
                        <FluxItem v-for="(item, i) of multicast.results.value" :key="i">
                            <FluxItemContent
                                :title="item.name || item.address"
                                :subtitle="`${item.type} · ${item.address}:${item.port}`"/>
                        </FluxItem>
                    </FluxItemStack>
                </FluxPaneBody>
            </FluxPane>
        </FluxApplicationSection>

        <FluxApplicationSection title="Unicast">
            <FluxPane>
                <FluxPaneHeader title="mDNS Unicast" subtitle="Query a specific host directly">
                    <template #actions>
                        <FluxPrimaryButton
                            icon-leading="router"
                            label="Query"
                            :is-disabled="!unicastAddress || unicast.isScanning.value"
                            @click="onUnicast"/>
                    </template>
                </FluxPaneHeader>
                <FluxPaneBody>
                    <FluxFormField label="Target IP address">
                        <FluxFormInput v-model="unicastAddress" placeholder="192.168.1.10"/>
                    </FluxFormField>

                    <FluxFormField label="Services (comma-separated)">
                        <FluxFormInput
                            v-model="unicastServices"
                            placeholder="_airplay._tcp.local"/>
                    </FluxFormField>

                    <FluxFormField label="Timeout (seconds)">
                        <FluxFormInput v-model.number="unicastTimeout" type="number" :min="1" :max="60"/>
                    </FluxFormField>

                    <FluxNotice v-if="unicast.error.value" type="danger" :message="unicast.error.value"/>

                    <FluxItemStack v-if="unicast.results.value.length > 0">
                        <FluxItem v-for="(item, i) of unicast.results.value" :key="i">
                            <FluxItemContent
                                :title="item.name || item.address"
                                :subtitle="`${item.type} · ${item.address}:${item.port}`"/>
                        </FluxItem>
                    </FluxItemStack>
                </FluxPaneBody>
            </FluxPane>
        </FluxApplicationSection>
    </FluxApplicationContent>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplicationContent, FluxApplicationSection } from '@flux-ui/application';
    import {
        FluxFormField,
        FluxFormInput,
        FluxItem,
        FluxItemContent,
        FluxItemStack,
        FluxNotice,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxPrimaryButton
    } from '@flux-ui/components';
    import { ref } from 'vue';
    import { useMdnsMulticast, useMdnsUnicast } from '@renderer/composable/mdns';
    import { defineTitle } from '@renderer/composable/ui';

    defineTitle('network-wired', 'mDNS Scanner');

    const multicast = useMdnsMulticast();
    const unicast = useMdnsUnicast();

    const multicastServices = ref('_airplay._tcp.local, _companion-link._tcp.local, _raop._tcp.local');
    const multicastTimeout = ref(4);

    const unicastAddress = ref('');
    const unicastServices = ref('_airplay._tcp.local, _companion-link._tcp.local, _raop._tcp.local');
    const unicastTimeout = ref(4);

    function parseServices(value: string): string[] {
        return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    async function onMulticast(): Promise<void> {
        await multicast.scan({
            services: parseServices(multicastServices.value),
            timeout: multicastTimeout.value
        });
    }

    async function onUnicast(): Promise<void> {
        await unicast.scan(unicastAddress.value, {
            services: parseServices(unicastServices.value),
            timeout: unicastTimeout.value
        });
    }
</script>
