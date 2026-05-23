import type { IpcMain } from 'electron';
import type { JsonStorage } from '@basmilius/apple-common';
import type {
    IpcEvent,
    IpcEventChannel,
    IpcRequest,
    IpcRequestChannel,
    IpcResponse
} from '@shared/ipc';
import type { ActiveDeviceService } from '../domain/activeDevice';
import type { AudioSourceFactory } from '../domain/audioSourceFactory';
import type { DiscoveryCache } from '../domain/discoveryCache';
import type { LogCollector } from '../domain/logCollector';
import type { MultiRoomService } from '../domain/multiRoom';
import type { NtpServerService } from '../domain/ntpServer';
import type { PairingSessionService } from '../domain/pairingSession';
import type { PtpMasterService } from '../domain/ptpMaster';
import { registerConnection } from './connection';
import { registerDiscovery } from './discovery';
import { registerLogs } from './logs';
import { registerMdns } from './mdns';
import { registerMedia } from './media';
import { registerMultiRoom } from './multiRoom';
import { registerPairing } from './pairing';
import { registerPlayback } from './playback';
import { registerRemote } from './remote';
import { registerState } from './state';
import { registerTiming } from './timing';
import { registerVolume } from './volume';

export type Broadcaster = <K extends IpcEventChannel>(channel: K, payload: IpcEvent<K>) => void;

export type IpcContext = {
    storage: JsonStorage;
    discovery: DiscoveryCache;
    activeDevice: ActiveDeviceService;
    pairing: PairingSessionService;
    ntp: NtpServerService;
    ptp: PtpMasterService;
    multiRoom: MultiRoomService;
    audioFactory: AudioSourceFactory;
    logs: LogCollector;
    broadcaster: Broadcaster;
};

export type HandlerFn<K extends IpcRequestChannel> = (
    ctx: IpcContext,
    payload: IpcRequest<K>
) => IpcResponse<K> | Promise<IpcResponse<K>>;

export function handle<K extends IpcRequestChannel>(
    ipcMain: IpcMain,
    ctx: IpcContext,
    channel: K,
    fn: HandlerFn<K>
): void {
    ipcMain.handle(channel, async (_event, payload: IpcRequest<K>) => {
        try {
            const data = await fn(ctx, payload);
            return {ok: true, data};
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {ok: false, error: message};
        }
    });
}

export function registerIpcHandlers(ipcMain: IpcMain, ctx: IpcContext): void {
    registerDiscovery(ipcMain, ctx);
    registerConnection(ipcMain, ctx);
    registerPairing(ipcMain, ctx);
    registerPlayback(ipcMain, ctx);
    registerVolume(ipcMain, ctx);
    registerRemote(ipcMain, ctx);
    registerMedia(ipcMain, ctx);
    registerMultiRoom(ipcMain, ctx);
    registerMdns(ipcMain, ctx);
    registerTiming(ipcMain, ctx);
    registerLogs(ipcMain, ctx);
    registerState(ipcMain, ctx);
}
