<template>
    <FluxPane>
        <FluxPaneHeader title="Log Console">
            <template #actions>
                <FluxSecondaryButton
                    icon-leading="arrows-rotate"
                    label="Reload"
                    @click="logs.loadSnapshot"/>
                <FluxDestructiveButton
                    icon-leading="ellipsis"
                    label="Clear"
                    @click="logs.clear"/>
            </template>
        </FluxPaneHeader>
        <FluxPaneBody>
            <FluxFormField label="Active log groups">
                <FluxButtonStack>
                    <FluxSecondaryButton
                        v-for="group of allGroups"
                        :key="group"
                        :label="group"
                        :color="isActive(group) ? 'primary' : 'gray'"
                        @click="toggle(group)"/>
                </FluxButtonStack>
            </FluxFormField>

            <div
                ref="logContainer"
                :class="$style.logConsoleLog"
                @scroll="onScroll">
                <div
                    v-for="(entry, i) of logs.entries.value"
                    :key="i"
                    :class="[$style.logConsoleLine, $style[`logConsoleLevel${capitalize(entry.level)}`]]">
                    <span :class="$style.logConsoleTime">{{ formatTime(entry.time) }}</span>
                    <span :class="$style.logConsoleCategory">[{{ entry.category }}]</span>
                    <span :class="$style.logConsoleMessage">{{ entry.message }}</span>
                </div>

                <div
                    v-if="logs.entries.value.length === 0"
                    :class="$style.logConsoleEmpty">
                    No log entries yet.
                </div>
            </div>
        </FluxPaneBody>
    </FluxPane>
</template>

<script
    lang="ts"
    setup>
    import {
        FluxButtonStack,
        FluxDestructiveButton,
        FluxFormField,
        FluxPane,
        FluxPaneBody,
        FluxPaneHeader,
        FluxSecondaryButton
    } from '@flux-ui/components';
    import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';
    import { useLogConsole } from '@renderer/composable/logs';
    import type { LogGroup } from '@shared/snapshots';

    const logs = useLogConsole();
    const logContainer = useTemplateRef<HTMLDivElement>('logContainer');
    const autoScroll = ref(true);

    const allGroups: LogGroup[] = ['debug', 'error', 'info', 'net', 'raw', 'warn'];

    function isActive(group: LogGroup): boolean {
        return logs.groups.value.includes(group);
    }

    async function toggle(group: LogGroup): Promise<void> {
        const next = isActive(group)
            ? logs.groups.value.filter(g => g !== group)
            : [...logs.groups.value, group];

        await logs.setGroups(next);
    }

    function formatTime(value: string): string {
        return value.split('T')[1]?.split('.')[0] ?? value;
    }

    function capitalize(value: string): string {
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function onScroll(): void {
        const el = logContainer.value;
        if (!el) {
            return;
        }
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        autoScroll.value = atBottom;
    }

    watch(() => logs.entries.value.length, async () => {
        if (!autoScroll.value) {
            return;
        }

        await nextTick();

        const el = logContainer.value;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    });

    onMounted(async () => {
        await logs.loadSnapshot();
        await nextTick();

        const el = logContainer.value;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    });
</script>

<style
    lang="scss"
    module>
    .logConsoleLog {
        font-family: var(--font-monospace, ui-monospace, SF Mono, monospace);
        font-size: 12px;
        line-height: 1.6;
        height: 40vh;
        overflow-y: auto;
        padding: 12px;
        background: var(--gray-50, #ffffff);
        border: 1px solid var(--gray-200);
        border-radius: 6px;
        color: var(--foreground);
    }

    .logConsoleLine {
        display: flex;
        gap: 8px;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .logConsoleEmpty {
        color: var(--foreground-secondary);
        font-style: italic;
        padding: 12px 0;
    }

    .logConsoleTime {
        color: var(--foreground-secondary);
        flex-shrink: 0;
    }

    .logConsoleCategory {
        color: var(--primary-500);
        flex-shrink: 0;
    }

    .logConsoleLevelError .logConsoleMessage {
        color: var(--danger-500);
    }

    .logConsoleLevelWarn .logConsoleMessage {
        color: var(--warning-500);
    }

    .logConsoleLevelInfo .logConsoleMessage {
        color: var(--info-500);
    }

    .logConsoleLevelDebug .logConsoleMessage {
        color: var(--foreground-secondary);
    }
</style>
