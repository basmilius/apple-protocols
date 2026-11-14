/** Lifecycle of a {@link Connection}. `failed` is where a connection ends after an error or a timeout. */
export type ConnectionState =
    | 'closing'
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'failed';

/**
 * Why a connection ended: we closed it (`local`), the device did (`remote`), the socket did not
 * open in time (`timeout`), or a socket or protocol error broke it (`error`).
 */
export type CloseReason = 'local' | 'remote' | 'timeout' | 'error';
