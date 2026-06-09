<template>
    <div class="tools-panel">
        <div class="input-group">
            <select
                v-model="selectedProperty"
                :disabled="!connected"
                class="property-select">
                <option value="">Select property...</option>
                <optgroup label="Volume">
                    <option value="Volume">Volume</option>
                    <option value="VolumeDB">VolumeDB</option>
                    <option value="VolumeLinear">VolumeLinear</option>
                    <option value="SoftwareVolume">SoftwareVolume</option>
                    <option value="IsMuted">IsMuted</option>
                </optgroup>
                <optgroup label="Playback">
                    <option value="ReceiverDeviceIsPlaying">ReceiverDeviceIsPlaying</option>
                    <option value="DenyInterruptions">DenyInterruptions</option>
                </optgroup>
                <optgroup label="Audio">
                    <option value="AudioFormat">AudioFormat</option>
                    <option value="AudioLatencyMs">AudioLatencyMs</option>
                    <option value="RedundantAudio">RedundantAudio</option>
                    <option value="SpatialAudio">SpatialAudio</option>
                    <option value="SpatialAudioActive">SpatialAudioActive</option>
                </optgroup>
                <optgroup label="Device">
                    <option value="DeviceName">DeviceName</option>
                    <option value="DeviceID">DeviceID</option>
                    <option value="IdleTimeout">IdleTimeout</option>
                    <option value="ReceiverMode">ReceiverMode</option>
                </optgroup>
                <optgroup label="Cluster">
                    <option value="ClusterUUID">ClusterUUID</option>
                    <option value="ClusterType">ClusterType</option>
                    <option value="IsClusterLeader">IsClusterLeader</option>
                </optgroup>
                <optgroup label="Other">
                    <option value="UsePTPClock">UsePTPClock</option>
                </optgroup>
            </select>

            <FluxFormInput
                v-model="customProperty"
                type="text"
                placeholder="Custom property..."
                :disabled="!connected"
                is-condensed/>

            <FluxSecondaryButton
                :disabled="!connected || !activeProperty"
                label="Get"
                @click="handleGet"/>
        </div>

        <div class="input-group">
            <FluxFormInput
                v-model="setValue"
                type="text"
                placeholder="Value..."
                :disabled="!connected"
                is-condensed
                @keydown.enter="handleSet"/>

            <FluxSecondaryButton
                :disabled="!connected || !activeProperty"
                label="Set"
                @click="handleSet"/>
        </div>

        <div
            v-if="result !== null"
            class="property-result">
            <pre>{{ formattedResult }}</pre>
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import { computed, ref } from 'vue';
    import { FluxFormInput, FluxSecondaryButton } from '@flux-ui/components';

    const props = defineProps<{
        connected: boolean;
    }>();

    const emit = defineEmits<{
        getProperty: [name: string];
        setProperty: [name: string, value?: string];
    }>();

    const selectedProperty = ref('');
    const customProperty = ref('');
    const setValue = ref('');
    const result = ref<unknown>(null);
    const loading = ref(false);

    const activeProperty = computed(() => customProperty.value || selectedProperty.value);

    const formattedResult = computed(() => {
        try {
            return JSON.stringify(result.value, null, 2);
        } catch {
            return String(result.value);
        }
    });

    const handleGet = async () => {
        const property = activeProperty.value;

        if (!property) {
            return;
        }

        loading.value = true;
        emit('getProperty', property);
    };

    const handleSet = () => {
        const property = activeProperty.value;

        if (!property) {
            return;
        }

        loading.value = true;
        emit('setProperty', property, setValue.value || undefined);
    };

    const setResult = (data: unknown) => {
        result.value = data;
        loading.value = false;
    };

    defineExpose({setResult});
</script>
