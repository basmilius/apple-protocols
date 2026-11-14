import { TimingServer } from '@corewire/airplay';
import type { Logger } from '@corewire/core';

let shared: Promise<TimingServer | undefined> | undefined;

/**
 * The NTP timing server all devices share, started by the first connect that needs it. It starts
 * at the connect and not at the first audio stream, because the remote control SETUP announces it
 * too. When it cannot bind, SETUP announces no timing and the next connect tries again.
 */
export function sharedTimingServer(logger: Logger): Promise<TimingServer | undefined> {
    shared ??= (async () => {
        const server = new TimingServer();

        try {
            await server.listen();

            return server;
        } catch (err) {
            logger.error('[timing]', 'The shared timing server failed to start.', err);
            server.close();
            shared = undefined;

            return undefined;
        }
    })();

    return shared;
}
