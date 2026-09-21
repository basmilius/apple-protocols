import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type DiagnosticsBridge, type EventChannel, type EventMap, type InvokeChannel, type InvokeRequest } from '@shared/contract';

/*
 * The only thing the renderer may reach. Both channel names are checked against the contract here,
 * so a typo in a panel fails in the panel rather than opening an unknown channel.
 */
const bridge: DiagnosticsBridge = {
    invoke(channel, request) {
        if (!INVOKE_CHANNELS.includes(channel as InvokeChannel)) {
            return Promise.reject(new Error(`Unknown invoke channel '${String(channel)}'.`));
        }

        return ipcRenderer.invoke(channel, request as InvokeRequest<InvokeChannel>);
    },
    on(channel, listener) {
        if (!EVENT_CHANNELS.includes(channel as EventChannel)) {
            throw new Error(`Unknown event channel '${String(channel)}'.`);
        }

        const handler = (_event: unknown, payload: EventMap[EventChannel]): void => listener(payload as never);

        ipcRenderer.on(channel, handler);

        return () => {
            ipcRenderer.removeListener(channel, handler);
        };
    }
};

contextBridge.exposeInMainWorld('diagnostics', bridge);
