<template>
    <FluxRoot>
        <FluxApplication>
            <template #menu>
                <Menu/>
            </template>

            <Top/>

            <RouterView v-slot="{Component}">
                <FluxRouteTransition>
                    <component :is="Component"/>
                </FluxRouteTransition>
            </RouterView>
        </FluxApplication>

        <PairingHandler/>
    </FluxRoot>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplication } from '@flux-ui/application';
    import { FluxRoot, FluxRouteTransition } from '@flux-ui/components';
    import Menu from './Menu.vue';
    import PairingHandler from './PairingHandler.vue';
    import Top from './Top.vue';
</script>
