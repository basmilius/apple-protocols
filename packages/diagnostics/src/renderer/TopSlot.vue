<template>
    <RouterView
        name="top"
        v-slot="{Component}">
        <FluxFadeTransition>
            <component :is="Component"/>
        </FluxFadeTransition>
    </RouterView>
</template>

<script
    lang="ts"
    setup>
    import { FluxFadeTransition } from '@flux-ui/components';
</script>
