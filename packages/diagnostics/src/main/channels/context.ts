import type { EventChannel, EventMap } from '@shared/contract';
import type { SessionManager } from '../session';
import type { StorageQueue } from '../storage';

export type ChannelContext = {
    readonly sessions: SessionManager;
    readonly storage: StorageQueue;
    send<C extends EventChannel>(channel: C, payload: EventMap[C]): void;
};
