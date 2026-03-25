<template>
    <div class="tools-panel">
        <!-- Extras -->
        <FluxButtonGroup>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="CC" @click="cmd('captions')"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="Dark" @click="cmd('darkmode')"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="Light" @click="cmd('lightmode')"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="Siri" @click="toggleSiri"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="Find" @click="cmd('findremote')"/>
        </FluxButtonGroup>

        <!-- URL input -->
        <div class="input-group">
            <FluxFormInput
                v-model="urlInput"
                type="url"
                placeholder="Audio URL..."
                :disabled="!connected"
                is-condensed
                @keydown.enter="handlePlayUrl"/>
            <FluxSecondaryButton :disabled="!connected || !urlInput" label="Play URL" @click="handlePlayUrl"/>
            <FluxSecondaryButton :disabled="!connected || !urlInput" label="Stream" @click="handleStream"/>
        </div>

        <!-- Text input -->
        <div class="input-group">
            <FluxFormInput
                v-model="textInput"
                type="text"
                placeholder="Text input..."
                :disabled="!connected || !isAppleTv"
                is-condensed
                @keydown.enter="handleTextSet"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv || !textInput" label="Set" @click="handleTextSet"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv || !textInput" label="Append" @click="handleTextAppend"/>
            <FluxSecondaryButton :disabled="!connected || !isAppleTv" label="Clear" @click="cmd('textclear')"/>
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import { ref } from 'vue';
    import { FluxButtonGroup, FluxFormInput, FluxSecondaryButton } from '@flux-ui/components';

    defineProps<{
        connected: boolean;
        isAppleTv: boolean;
    }>();

    const emit = defineEmits<{
        command: [cmd: string, arg?: string];
    }>();

    const cmd = (command: string, arg?: string) => emit('command', command, arg);

    const urlInput = ref('');
    const textInput = ref('');
    const siriActive = ref(false);

    const handleStream = () => {
        if (urlInput.value) {
            cmd('stream', urlInput.value);
            urlInput.value = '';
        }
    };

    const handlePlayUrl = () => {
        if (urlInput.value) {
            cmd('playurl', urlInput.value);
            urlInput.value = '';
        }
    };

    const handleTextSet = () => {
        if (textInput.value) {
            cmd('type', textInput.value);
        }
    };

    const handleTextAppend = () => {
        if (textInput.value) {
            cmd('append', textInput.value);
            textInput.value = '';
        }
    };

    const toggleSiri = () => {
        if (siriActive.value) {
            cmd('siristop');
            siriActive.value = false;
        } else {
            cmd('siristart');
            siriActive.value = true;
        }
    };
</script>
