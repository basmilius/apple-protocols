import type { EventChannel, EventMap } from '@shared/contract';
import type { SessionManager } from '../session';
import type { StorageQueue } from '../storage';

/** What a domain's channel module gets from the app instead of importing main's singletons. */
export type ChannelContext = {
    readonly sessions: SessionManager;
    readonly storage: StorageQueue;
    send<C extends EventChannel>(channel: C, payload: EventMap[C]): void;
};
