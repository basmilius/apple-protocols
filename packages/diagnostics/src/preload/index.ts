import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IPC_EVENT_CHANNELS, type IpcEventChannel } from '@shared/ipc';

type ResponseEnvelope = { ok: true; data: unknown } | { ok: false; error: string };

const api = {
    invoke: async (channel: string, payload: unknown): Promise<unknown> => {
        const response = await ipcRenderer.invoke(channel, payload) as ResponseEnvelope;

        if (response.ok === false) {
            throw new Error(response.error);
        }

        return response.data;
    },
    on: (channel: string, listener: (data: unknown) => void): (() => void) => {
        if (!IPC_EVENT_CHANNELS.includes(channel as IpcEventChannel)) {
            throw new Error(`Unknown event channel: ${channel}`);
        }

        const wrapped = (_event: IpcRendererEvent, data: unknown) => listener(data);
        ipcRenderer.on(channel, wrapped);

        return () => {
            ipcRenderer.off(channel, wrapped);
        };
    }
};

contextBridge.exposeInMainWorld('api', api);
