export type ConnectionState =
    | 'closing'
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'failed';

export type EventMap = Record<string, any>;
