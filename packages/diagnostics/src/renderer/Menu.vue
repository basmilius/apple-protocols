<template>
    <FluxApplicationMenu :class="$style.menuRoot">
        <template #header>
            <FluxApplicationMenuAccount
                icon="apple"
                :label="device?.name ?? 'Apple Protocols'"
                :description="device?.model ?? 'No device connected'"/>
        </template>

        <template #context>
            <FluxApplicationMenuContextStack name="menu"/>
        </template>

        <FluxMenuGroup>
            <FluxMenuItem
                icon-leading="radar"
                :is-active="isActive('devices')"
                label="Devices"
                :to="{name: 'devices'}"
                type="route"/>

            <FluxMenuItem
                icon-leading="signal-stream"
                :is-active="isActive('multi-room')"
                label="Multi-Room"
                :to="{name: 'multi-room'}"
                type="route"/>
        </FluxMenuGroup>

        <FluxDivider/>

        <FluxMenuGroup label="Diagnostics">
            <FluxMenuItem
                icon-leading="network-wired"
                :is-active="isActive('mdns')"
                label="mDNS Scanner"
                :to="{name: 'mdns'}"
                type="route"/>

            <FluxMenuItem
                icon-leading="clock"
                :is-active="isActive('timing')"
                label="Timing"
                :to="{name: 'timing'}"
                type="route"/>
        </FluxMenuGroup>
    </FluxApplicationMenu>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplicationMenu, FluxApplicationMenuAccount, FluxApplicationMenuContextStack } from '@flux-ui/application';
    import { FluxDivider, FluxMenuGroup, FluxMenuItem } from '@flux-ui/components';
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';
    import { useDeviceConnection } from '@renderer/composable/device';

    const route = useRoute();
    const {snapshot} = useDeviceConnection();

    const device = computed(() => snapshot.value.device);

    function isActive(name: string): boolean {
        if (route.name === name) {
            return true;
        }

        return Array.isArray(route.matched) && route.matched.some(record => record.name === name);
    }
</script>

<style
    lang="scss"
    module>
    .menuRoot {
        padding-top: 30px;
    }
</style>
