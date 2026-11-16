import { TimingServer } from '@apple-protocols/airplay';
import { Logger, type LogSink } from '@apple-protocols/core';

type Shared = {
    readonly server: Promise<TimingServer | undefined>;
    readonly users: Set<object>;
};

/** The log sinks of the devices that use the shared server; its logs go to each of them. */
const sinks: Map<object, LogSink> = new Map();
const logger = new Logger('timing-server', (group, args) => {
    for (const sink of sinks.values()) {
        sink(group, args);
    }
});

let shared: Shared | undefined;

/**
 * The NTP timing server all devices share. The first device that connects starts it and the last
 * one that disconnects closes it, so a script exits once its devices are gone. It starts at the
 * connect and not at the first audio stream, because the remote control SETUP announces it too.
 * When it cannot bind, SETUP announces no timing and the next connect tries again.
 *
 * @param user - The device; a second call for the same device counts once.
 * @param sink - Receives the logs of the server while this device uses it.
 */
export async function acquireTimingServer(user: object, sink?: LogSink): Promise<TimingServer | undefined> {
    if (sink) {
        sinks.set(user, sink);
    }

    shared ??= {server: start(), users: new Set()};
    shared.users.add(user);

    return await shared.server;
}

/** Ends the use by this device; closes the server when nobody uses it anymore. */
export function releaseTimingServer(user: object): void {
    sinks.delete(user);

    const current = shared;

    if (!current?.users.delete(user) || current.users.size > 0) {
        return;
    }

    shared = undefined;
    void current.server.then(server => server?.close());
}

async function start(): Promise<TimingServer | undefined> {
    const server = new TimingServer({logger});

    try {
        await server.listen();

        return server;
    } catch (err) {
        logger.error('[timing]', 'The shared timing server failed to start.', err);
        server.close();
        shared = undefined;

        return undefined;
    }
}
