<template>
    <div class="sidebar-section sidebar-section-fill">
        <div class="section-header">
            <h3>mDNS Scanner</h3>
        </div>

        <div class="section-body">
            <FluxForm>
                <FluxFormColumn>
                    <FluxFormField label="Mode">
                        <FluxFormSelect
                            v-model="mode"
                            :options="modeOptions"
                            :disabled="scanning"/>
                    </FluxFormField>

                    <template v-if="mode === 'unicast'">
                        <FluxFormField label="Host">
                            <FluxFormInput
                                v-model="host"
                                type="text"
                                placeholder="IP address..."
                                :disabled="scanning"/>
                        </FluxFormField>
                    </template>

                    <FluxSecondaryButton
                        icon-leading="magnifying-glass"
                        label="Scan"
                        :is-loading="scanning"
                        :disabled="scanning || (mode === 'unicast' && !host)"
                        @click="handleScan()"/>
                </FluxFormColumn>
            </FluxForm>
        </div>

        <div
            v-if="results.length > 0"
            class="mdns-results">
            <div
                v-for="(service, index) in results"
                :key="index"
                class="mdns-result-item">
                <div class="mdns-result-name">{{ service.name }}</div>
                <div class="mdns-result-meta">
                    {{ serviceLabel(service.type) }} &middot; {{ service.address }}:{{ service.port }}
                </div>

                <details
                    v-if="Object.keys(service.properties).length > 0"
                    class="raw-state">
                    <summary>TXT Records</summary>
                    <div class="raw-state-content">
                        <div
                            v-for="(value, key) in service.properties"
                            :key="key"
                            class="state-row">
                            <span class="state-label">{{ key }}</span>
                            <span class="state-value">{{ value }}</span>
                        </div>
                    </div>
                </details>
            </div>
        </div>

        <div
            v-else-if="hasScanned && !scanning"
            class="empty-state">
            No services found
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import { ref } from 'vue';
    import { FluxForm, FluxFormColumn, FluxFormField, FluxFormInput, FluxFormSelect, FluxSecondaryButton } from '@flux-ui/components';
    import type { MdnsResult } from '../composables/useDevice';

    const props = defineProps<{
        scanMdns: (mode: 'multicast' | 'unicast', host?: string) => Promise<MdnsResult[]>;
    }>();

    const mode = ref<'multicast' | 'unicast'>('multicast');
    const host = ref('');
    const scanning = ref(false);
    const hasScanned = ref(false);
    const results = ref<MdnsResult[]>([]);

    const modeOptions = [
        {label: 'Multicast', value: 'multicast'},
        {label: 'Unicast', value: 'unicast'}
    ];

    const serviceLabel = (type: string): string => {
        if (type.includes('_airplay')) {
            return 'AirPlay';
        }
        if (type.includes('_companion-link')) {
            return 'Companion Link';
        }
        if (type.includes('_raop')) {
            return 'RAOP';
        }

        return type;
    };

    const handleScan = async () => {
        if (scanning.value) {
            return;
        }

        if (mode.value === 'unicast' && !host.value) {
            return;
        }

        scanning.value = true;
        hasScanned.value = true;
        results.value = [];

        try {
            results.value = await props.scanMdns(
                mode.value,
                mode.value === 'unicast' ? host.value : undefined
            );
        } finally {
            scanning.value = false;
        }
    };
</script>
