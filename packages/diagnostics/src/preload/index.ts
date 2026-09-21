import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type DiagnosticsBridge, type EventChannel, type EventMap, type InvokeChannel, type InvokeRequest } from '@shared/contract';

/* Renderer access is restricted to the contract's invoke and event channels. */
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
