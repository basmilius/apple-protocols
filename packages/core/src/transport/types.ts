/** Possible states of a TCP connection managed by {@link Connection}. */
export type ConnectionState =
    | 'closing'
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'failed';
