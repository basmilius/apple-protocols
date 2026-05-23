import type { IpcEventChannel, IpcEventMap, IpcRequestChannel, IpcRequestMap } from '@shared/ipc';

export async function invoke<K extends IpcRequestChannel>(
    channel: K,
    payload: IpcRequestMap[K]['req']
): Promise<IpcRequestMap[K]['res']> {
    return window.api.invoke(channel, payload) as Promise<IpcRequestMap[K]['res']>;
}

export type InvokeResult<K extends IpcRequestChannel> =
    | {ok: true; data: IpcRequestMap[K]['res']; error?: undefined}
    | {ok: false; data?: undefined; error: string};

export async function invokeSafe<K extends IpcRequestChannel>(
    channel: K,
    payload: IpcRequestMap[K]['req']
): Promise<InvokeResult<K>> {
    try {
        const data = await invoke(channel, payload);
        return {ok: true, data};
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {ok: false, error: message};
    }
}

export function on<K extends IpcEventChannel>(
    channel: K,
    listener: (data: IpcEventMap[K]) => void
): () => void {
    return window.api.on(channel, listener as (data: unknown) => void);
}
