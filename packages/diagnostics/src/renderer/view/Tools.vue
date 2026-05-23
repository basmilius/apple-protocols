<template>
    <FluxApplicationContent layout="medium">
        <ToolsPanel/>
    </FluxApplicationContent>
</template>

<script
    lang="ts"
    setup>
    import { FluxApplicationContent } from '@flux-ui/application';
    import ToolsPanel from '@renderer/component/ToolsPanel.vue';
    import { defineTitle } from '@renderer/composable/ui';

    defineTitle('key', 'Tools');
</script>
