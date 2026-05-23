import { invoke } from '@renderer/app/ipc';

export function useRemoteHid() {
    return {
        async press(usagePage: number, usage: number): Promise<void> {
            await invoke('remote:hid', {usagePage, usage, kind: 'press'});
        },
        async longPress(usagePage: number, usage: number, duration: number = 1000): Promise<void> {
            await invoke('remote:hid', {usagePage, usage, kind: 'long', duration});
        },
        async doublePress(usagePage: number, usage: number): Promise<void> {
            await invoke('remote:hid', {usagePage, usage, kind: 'double'});
        }
    };
}
