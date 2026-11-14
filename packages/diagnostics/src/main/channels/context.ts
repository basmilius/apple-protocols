import type { DeviceEvent, EventChannel, EventMap } from '@shared/contract';
import type { ProxyManager } from '../proxy/manager';
import type { SessionManager } from '../session';
import type { StorageQueue } from '../storage';

export type ChannelContext = {
    readonly sessions: SessionManager;
    readonly storage: StorageQueue;
    readonly proxies: ProxyManager;
    send<C extends EventChannel>(channel: C, payload: EventMap[C]): void;

    /** Every event a device session forwards. */
    onEvent(listener: (event: DeviceEvent) => void): void;
};
