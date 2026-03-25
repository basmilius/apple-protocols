<script
    setup
    lang="ts">
    import { ref } from 'vue';

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

<template>
    <div class="remote-container">
        <div class="remote-top">
        <!-- D-pad -->
        <div class="dpad">
            <button
                class="control-btn dpad-btn-up"
                :disabled="!connected || !isAppleTv"
                title="Up"
                @click="cmd('up')">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path d="M297.4 201.4a32.05 32.05 0 0 1 45.3 0l160 160a32.05 32.05 0 0 1 0 45.3 32.05 32.05 0 0 1-45.3 0L320 269.3 182.6 406.6a32.05 32.05 0 0 1-45.3 0 32.05 32.05 0 0 1 0-45.3l160-160z"/>
                </svg>
            </button>

            <button
                class="control-btn dpad-btn-left"
                :disabled="!connected || !isAppleTv"
                title="Left"
                @click="cmd('left')">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path d="M201.4 297.4a32.05 32.05 0 0 0 0 45.3l160 160a32.05 32.05 0 0 0 45.3 0 32.05 32.05 0 0 0 0-45.3L269.3 320l137.3-137.4a32.05 32.05 0 0 0 0-45.3 32.05 32.05 0 0 0-45.3 0l-160 160z"/>
                </svg>
            </button>

            <button
                class="control-btn dpad-btn-select"
                :disabled="!connected || !isAppleTv"
                title="Select"
                @click="cmd('select')">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path d="M160 320c0-88.4 71.6-160 160-160s160 71.6 160 160-71.6 160-160 160-160-71.6-160-160"/>
                </svg>
            </button>

            <button
                class="control-btn dpad-btn-right"
                :disabled="!connected || !isAppleTv"
                title="Right"
                @click="cmd('right')">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path d="M439.1 297.4a32.05 32.05 0 0 1 0 45.3l-160 160a32.05 32.05 0 0 1-45.3 0 32.05 32.05 0 0 1 0-45.3L371.2 320 233.9 182.6a32.05 32.05 0 0 1 0-45.3 32.05 32.05 0 0 1 45.3 0l160 160z"/>
                </svg>
            </button>

            <button
                class="control-btn dpad-btn-down"
                :disabled="!connected || !isAppleTv"
                title="Down"
                @click="cmd('down')">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640">
                    <path d="M297.4 438.6a32.05 32.05 0 0 0 45.3 0l160-160a32.05 32.05 0 0 0 0-45.3 32.05 32.05 0 0 0-45.3 0L320 370.7 182.6 233.4a32.05 32.05 0 0 0-45.3 0 32.05 32.05 0 0 0 0 45.3l160 160z"/>
                </svg>
            </button>
        </div>

        <!-- Button rows -->
        <div class="button-rows">
            <!-- System: Back, Home, Top Menu, Power -->
            <div class="button-row">
                <button class="control-btn" :disabled="!connected || !isAppleTv" title="Back" @click="cmd('back')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M73.4 297.4C60.9 309.9 60.9 330.2 73.4 342.7L233.4 502.7C245.9 515.2 266.2 515.2 278.7 502.7C291.2 490.2 291.2 469.9 278.7 457.4L173.3 352L544 352C561.7 352 576 337.7 576 320C576 302.3 561.7 288 544 288L173.3 288L278.7 182.6C291.2 170.1 291.2 149.8 278.7 137.3C266.2 124.8 245.9 124.8 233.4 137.3L73.4 297.3z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected || !isAppleTv" title="Home" @click="cmd('home')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M96 160v240h448V160zm-64 0c0-35.3 28.7-64 64-64h448c35.3 0 64 28.7 64 64v240c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64zm160 352h256c17.7 0 32 14.3 32 32s-14.3 32-32 32H192c-17.7 0-32-14.3-32-32s14.3-32 32-32"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected || !isAppleTv" title="Top Menu" @click="cmd('topmenu')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M128 128h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32zm0 160h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32zm0 160h384c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected || !isAppleTv" title="Power" @click="cmd('power')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32v256c0 17.7 14.3 32 32 32s32-14.3 32-32zm-141.7 98.4c14.5-10.1 18-30.1 7.9-44.6a32.05 32.05 0 0 0-44.6-7.9C107.4 156.1 64 233 64 320c0 141.4 114.6 256 256 256s256-114.6 256-256c0-87-43.4-163.9-109.7-210.1a32.07 32.07 0 0 0-44.6 7.9 32 32 0 0 0 7.9 44.6c49.8 34.8 82.3 92.4 82.3 157.6 0 106-86 192-192 192S128 426 128 320c0-65.2 32.5-122.9 82.3-157.6"/>
                    </svg>
                </button>
            </div>

            <!-- Media: Previous, PlayPause, Next -->
            <div class="button-row">
                <button class="control-btn" :disabled="!connected" title="Skip Back" @click="cmd('skipbackward')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M491 100.8c-12.9-7-28.7-6.3-41 1.8L192 272.1V128c0-17.7-14.3-32-32-32s-32 14.3-32 32v384c0 17.7 14.3 32 32 32s32-14.3 32-32V367.9l258 169.6c12.3 8.1 28 8.8 41 1.8s21-20.5 21-35.2v-368c0-14.7-8.1-28.2-21-35.2z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Previous" @click="cmd('previous')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M491 100.8c-12.9-7-28.7-6.3-41 1.8L192 272.1V128c0-17.7-14.3-32-32-32s-32 14.3-32 32v384c0 17.7 14.3 32 32 32s32-14.3 32-32V367.9l258 169.6c12.3 8.1 28 8.8 41 1.8s21-20.5 21-35.2v-368c0-14.7-8.1-28.2-21-35.2z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Play / Pause" @click="cmd('playpause')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M116.5 135.4c-9.5-7.9-22.8-9.7-34.1-4.4A32 32 0 0 0 64 160v320c0 12.4 7.2 23.7 18.4 29s24.5 3.6 34.1-4.4l192-160a32.03 32.03 0 0 0 0-49.2zM448 160c0-17.7-14.3-32-32-32s-32 14.3-32 32v320c0 17.7 14.3 32 32 32s32-14.3 32-32zm128 0c0-17.7-14.3-32-32-32s-32 14.3-32 32v320c0 17.7 14.3 32 32 32s32-14.3 32-32z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Next" @click="cmd('next')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M149 100.8c12.9-7 28.7-6.3 41 1.8l258 169.5V128c0-17.7 14.3-32 32-32s32 14.3 32 32v384c0 17.7-14.3 32-32 32s-32-14.3-32-32V367.9L190 537.5a39.97 39.97 0 0 1-62-33.5V136c0-14.7 8.1-28.2 21-35.2"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Skip Forward" @click="cmd('skipforward')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M149 100.8c12.9-7 28.7-6.3 41 1.8l258 169.5V128c0-17.7 14.3-32 32-32s32 14.3 32 32v384c0 17.7-14.3 32-32 32s-32-14.3-32-32V367.9L190 537.5a39.97 39.97 0 0 1-62-33.5V136c0-14.7 8.1-28.2 21-35.2"/>
                    </svg>
                </button>
            </div>

            <!-- Volume: Mute, VolDown, VolUp -->
            <div class="button-row">
                <button class="control-btn" :disabled="!connected" title="Mute" @click="cmd('mute')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M80 416h48l134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8V130.8c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L128 224H80c-26.5 0-48 21.5-48 48v96c0 26.5 21.5 48 48 48m319-177a23.9 23.9 0 0 0 0 33.9l47 47-47 47a23.9 23.9 0 0 0 0 33.9c9.4 9.3 24.6 9.4 33.9 0l47-47 47 47a23.9 23.9 0 0 0 33.9 0c9.3-9.4 9.4-24.6 0-33.9l-47-47 47-47a23.9 23.9 0 0 0 0-33.9c-9.4-9.3-24.6-9.4-33.9 0l-47 47-47-47a23.9 23.9 0 0 0-33.9 0"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Volume Down" @click="cmd('voldown')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M144 416h48l134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8V130.8c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L192 224h-48c-26.5 0-48 21.5-48 48v96c0 26.5 21.5 48 48 48m332.6-170.5a24 24 0 0 0-33.8 3.5 24 24 0 0 0 3.5 33.8A47.9 47.9 0 0 1 464 320c0 15-6.9 28.4-17.7 37.3a24.1 24.1 0 0 0-3.5 33.8c8.3 10.3 23.5 11.8 33.8 3.5 21.5-17.7 35.4-44.5 35.4-74.6a95.9 95.9 0 0 0-35.5-74.5z"/>
                    </svg>
                </button>
                <button class="control-btn" :disabled="!connected" title="Volume Up" @click="cmd('volup')">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M533.6 96.5a24 24 0 0 0-33.8 3.5 24 24 0 0 0 3.5 33.8c54.2 44 88.7 111 88.7 186.2s-34.5 142.2-88.7 186.3a24.1 24.1 0 0 0-3.5 33.8c8.3 10.3 23.5 11.8 33.8 3.5C598.5 490.7 640 410.2 640 320S598.5 149.2 533.6 96.5M473.1 171a24 24 0 0 0-33.8 3.5 24 24 0 0 0 3.5 33.8C475.3 234.7 496 274.9 496 320s-20.7 85.3-53.2 111.8a24.1 24.1 0 0 0-3.5 33.8c8.3 10.3 23.5 11.8 33.8 3.5 43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5a24 24 0 0 0-33.8 3.5 24 24 0 0 0 3.5 33.8A47.9 47.9 0 0 1 400 320c0 15-6.9 28.4-17.7 37.3a24.1 24.1 0 0 0-3.5 33.8c8.3 10.3 23.5 11.8 33.8 3.5 21.5-17.7 35.4-44.5 35.4-74.6s-13.9-56.9-35.4-74.5M80 416h48l134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8V130.8c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L128 224H80c-26.5 0-48 21.5-48 48v96c0 26.5 21.5 48 48 48"/>
                    </svg>
                </button>
            </div>

            <!-- Extras: Captions, Dark/Light, Siri, Find Remote -->
            <div class="button-row">
                <button class="btn btn-sm" :disabled="!connected || !isAppleTv" title="Captions" @click="cmd('captions')">CC</button>
                <button class="btn btn-sm" :disabled="!connected || !isAppleTv" title="Dark Mode" @click="cmd('darkmode')">Dark</button>
                <button class="btn btn-sm" :disabled="!connected || !isAppleTv" title="Light Mode" @click="cmd('lightmode')">Light</button>
                <button class="btn btn-sm" :disabled="!connected || !isAppleTv" :class="{active: siriActive}" title="Siri" @click="toggleSiri">Siri</button>
                <button class="btn btn-sm" :disabled="!connected || !isAppleTv" title="Find Remote" @click="cmd('findremote')">Find</button>
            </div>
        </div>
        </div>

        <!-- URL input -->
        <div class="input-group">
            <input
                v-model="urlInput"
                class="text-input"
                type="url"
                placeholder="Audio URL..."
                :disabled="!connected"
                @keydown.enter="handlePlayUrl">
            <button class="btn btn-sm" :disabled="!connected || !urlInput" @click="handlePlayUrl">Play URL</button>
            <button class="btn btn-sm" :disabled="!connected || !urlInput" @click="handleStream">Stream</button>
        </div>

        <!-- Text input -->
        <div class="input-group">
            <input
                v-model="textInput"
                class="text-input"
                type="text"
                placeholder="Text input..."
                :disabled="!connected || !isAppleTv"
                @keydown.enter="handleTextSet">
            <button class="btn btn-sm" :disabled="!connected || !isAppleTv || !textInput" @click="handleTextSet">Set</button>
            <button class="btn btn-sm" :disabled="!connected || !isAppleTv || !textInput" @click="handleTextAppend">Append</button>
            <button class="btn btn-sm" :disabled="!connected || !isAppleTv" @click="cmd('textclear')">Clear</button>
        </div>
    </div>
</template>
