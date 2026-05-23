import { invoke } from '@renderer/app/ipc';
import type { RemoteTransport } from '@shared/ipc';

type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export function useRemoteGestures() {
    return {
        async swipe(direction: SwipeDirection, options: {duration?: number; transport?: RemoteTransport} = {}): Promise<void> {
            await invoke('remote:gesture', {
                type: 'swipe',
                direction,
                duration: options.duration,
                transport: options.transport
            });
        },
        async tap(x: number, y: number, options: {finger?: number; transport?: RemoteTransport} = {}): Promise<void> {
            await invoke('remote:gesture', {
                type: 'tap',
                x,
                y,
                finger: options.finger,
                transport: options.transport
            });
        }
    };
}
