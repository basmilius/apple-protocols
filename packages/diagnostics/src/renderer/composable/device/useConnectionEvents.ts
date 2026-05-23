import { onScopeDispose } from 'vue';
import { on } from '@renderer/app/ipc';
import type { DeviceInfo } from '@shared/snapshots';

type ConnectedListener = (info: DeviceInfo) => void;
type DisconnectedListener = (payload: {unexpected: boolean}) => void;
type RecoveringListener = (payload: {attempt: number}) => void;

export function useConnectionEvents() {
    const cleanups: Array<() => void> = [];

    onScopeDispose(() => {
        for (const off of cleanups) {
            off();
        }
    });

    return {
        onConnected(listener: ConnectedListener): void {
            cleanups.push(on('device:connected', listener));
        },
        onDisconnected(listener: DisconnectedListener): void {
            cleanups.push(on('device:disconnected', listener));
        },
        onRecovering(listener: RecoveringListener): void {
            cleanups.push(on('device:recovering', listener));
        },
        onRecoveryFailed(listener: () => void): void {
            cleanups.push(on('device:recovery-failed', listener));
        }
    };
}
