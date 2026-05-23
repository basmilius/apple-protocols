import { onScopeDispose } from 'vue';
import { on } from '@renderer/app/ipc';
import type { LogEntry } from '@shared/snapshots';

export function useLogStream() {
    const cleanups: Array<() => void> = [];

    onScopeDispose(() => {
        for (const off of cleanups) {
            off();
        }
    });

    return {
        onEntry(listener: (entry: LogEntry) => void): void {
            cleanups.push(on('log:entry', listener));
        }
    };
}
