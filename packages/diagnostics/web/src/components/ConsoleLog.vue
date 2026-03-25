<script
    setup
    lang="ts">
    import { nextTick, ref, watch } from 'vue';
    import type { LogEntry } from '../composables/useWebSocket';

    const props = defineProps<{
        logs: LogEntry[];
    }>();

    const emit = defineEmits<{
        clear: [];
    }>();

    const logContainer = ref<HTMLDivElement | null>(null);
    const autoScroll = ref(true);

    const onScroll = () => {
        const el = logContainer.value;

        if (!el) {
            return;
        }

        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        autoScroll.value = atBottom;
    };

    watch(() => props.logs.length, async () => {
        if (!autoScroll.value) {
            return;
        }

        await nextTick();

        const el = logContainer.value;

        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    });

    const categoryClass = (category: string): string => {
        const normalized = category.replace(/[^a-z-]/g, '');
        return `cat-${normalized}`;
    };
</script>

<template>
    <div class="console-container">
        <div class="console-header">
            <h3>Console</h3>
            <button
                class="btn btn-sm"
                @click="emit('clear')">
                Clear
            </button>
        </div>

        <div
            ref="logContainer"
            class="console-log"
            @scroll="onScroll">
            <div
                v-for="(entry, index) in logs"
                :key="index"
                class="log-entry"
                :class="categoryClass(entry.category)">
                <span class="log-time">{{ entry.time }}</span>
                <span class="log-category">[{{ entry.category }}]</span>
                <span class="log-message">{{ entry.message }}</span>
            </div>

            <div
                v-if="logs.length === 0"
                class="empty-state">
                No log entries
            </div>
        </div>
    </div>
</template>
