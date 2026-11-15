import type { Server } from 'node:net';

/** A protocol-specific proxy that diagnostics can start and stop. */
export interface ProtocolProxy {
    /** Such as `companion-link`. */
    readonly name: string;

    /** Starts listening for controllers and advertising. */
    start(): Promise<void>;

    stop(): Promise<void>;
}

/**
 * Listens on a port and rejects when it cannot be bound, instead of leaving an `error` event
 * that nobody handles.
 */
export function listen(server: Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);

        server.listen(port, () => {
            server.off('error', reject);
            resolve();
        });
    });
}
