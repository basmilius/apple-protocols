<template></template>

<script
    lang="ts"
    setup>
    import { showPrompt } from '@flux-ui/components';
    import { watch } from 'vue';
    import { usePairingFlow } from '@renderer/composable/pairing';

    const pairing = usePairingFlow();

    watch(() => pairing.phase.value, async (phase) => {
        if (phase !== 'awaiting-pin') {
            return;
        }

        const result = await showPrompt({
            title: `Pair ${pairing.deviceName.value ?? 'device'}`,
            message: 'Enter the PIN shown on the device screen.',
            fieldLabel: 'PIN',
            fieldPlaceholder: '0000',
            icon: 'key'
        });

        if (result === false) {
            await pairing.cancel();
            return;
        }

        await pairing.submitPin(result);
    });
</script>
