import { randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@apple-protocols/core/transport';
import { PROXY_PROTOCOLS, type ProxyProtocol, type ProxyStartRequest, type ProxyStatus } from '@shared/contract';
import type { SessionManager } from '../session';
import type { JsonStorage } from '../storage';
import { AirPlayProxy } from './airplay/proxy';
import { CompanionLinkProxy } from './companionLink/proxy';
import type { ProtocolProxy } from './core/protocolProxy';
import { ProxyTap } from './core/tap';
import { ProxyStore } from './store';

const CAPTURE_DIRECTORY = join(homedir(), '.config', 'apple-protocols', 'proxy-captures');

const DEFAULT_PORTS: Record<ProxyProtocol, number> = {airplay: 7000, companionLink: 49152};
const LABELS: Record<ProxyProtocol, string> = {airplay: 'AirPlay', companionLink: 'Companion Link'};
const TAP_LABELS: Record<ProxyProtocol, string> = {airplay: 'airplay', companionLink: 'companion-link'};

type RunningProxy = {
    readonly status: Omit<ProxyStatus, 'messages'>;
    readonly proxy: ProtocolProxy;
    readonly tap: ProxyTap;
    readonly context: Context;
};

/**
 * Runs at most one proxy per protocol, so an AirPlay and a Companion Link proxy can run side by
 * side. A proxy advertises itself, terminates the pairing of a controller and relays to the real
 * device with the credentials diagnostics stored for it. What it relays goes into the traffic
 * buffer as protocol `proxy`, and its logs carry the id of the device it relays to.
 */
export class ProxyManager {
    readonly #sessions: SessionManager;
    readonly #storage: JsonStorage;
    readonly #onChange: (status: readonly ProxyStatus[]) => void;
    readonly #running = new Map<ProxyProtocol, RunningProxy>();
    readonly #starting = new Set<ProxyProtocol>();
    readonly #store = new ProxyStore();

    constructor(sessions: SessionManager, storage: JsonStorage, onChange: (status: readonly ProxyStatus[]) => void) {
        this.#sessions = sessions;
        this.#storage = storage;
        this.#onChange = onChange;
    }

    status(): readonly ProxyStatus[] {
        return Array.from(this.#running.values()).map(running => ({...running.status, messages: {...running.tap.counts}}));
    }

    /** @throws {Error} With a message meant for the user, such as a port that is already in use. */
    async start(request: ProxyStartRequest): Promise<ProxyStatus> {
        const protocol = request?.protocol;

        if (!PROXY_PROTOCOLS.includes(protocol)) {
            throw new Error(`Unknown proxy protocol '${String(protocol)}'. Use ${PROXY_PROTOCOLS.join(' or ')}.`);
        }

        if (typeof request.deviceId !== 'string' || request.deviceId.length === 0) {
            throw new Error('A proxy needs the deviceId of the device it relays to.');
        }

        if (request.port !== undefined && (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535)) {
            throw new Error('The port must be a whole number from 1 to 65535.');
        }

        if (this.#running.has(protocol) || this.#starting.has(protocol)) {
            throw new Error(`A ${LABELS[protocol]} proxy is already running. Stop it first.`);
        }

        this.#starting.add(protocol);

        try {
            const status = await this.#start(protocol, request);
            this.#onChange(this.status());

            return status;
        } finally {
            this.#starting.delete(protocol);
        }
    }

    /** Does nothing when no proxy runs for the protocol. */
    async stop(protocol: ProxyProtocol): Promise<void> {
        const running = this.#running.get(protocol);

        if (!running) {
            return;
        }

        this.#running.delete(protocol);

        try {
            await running.proxy.stop();
        } finally {
            running.tap.close();
            running.context.logger.info('[proxy]', `${LABELS[protocol]} proxy stopped.`);
            this.#onChange(this.status());
        }
    }

    async stopAll(): Promise<void> {
        await Promise.allSettled(Array.from(this.#running.keys()).map(protocol => this.stop(protocol)));
    }

    async #start(protocol: ProxyProtocol, request: ProxyStartRequest): Promise<ProxyStatus> {
        const label = LABELS[protocol];
        const device = this.#sessions.discoveredDevice(request.deviceId);

        if (!device) {
            throw new Error(`Device '${request.deviceId}' is not in the last discovery result. Scan first.`);
        }

        const service = device.services[protocol];

        if (!service) {
            throw new Error(`${device.name} does not advertise ${label}.`);
        }

        const credentials = this.#storage.getCredentials(service.id ?? device.id, protocol);

        if (!credentials) {
            throw new Error(`No ${label} credentials stored for ${device.name}. Pair this app with it first.`);
        }

        this.#store.load();

        const port = request.port ?? DEFAULT_PORTS[protocol];
        const capturePath = request.capture === true ? await createCapturePath(protocol) : null;
        const context = new Context(device.id);
        const tap = new ProxyTap(context, TAP_LABELS[protocol], capturePath ?? undefined);
        const instanceName = `${device.name} (Proxy)`;
        const pin = String(randomInt(1000, 10000));

        const options = {
            context,
            device: service,
            credentials,
            store: this.#store,
            tap,
            pin,
            listenPort: port,
            instanceName
        };

        const proxy = protocol === 'airplay' ? new AirPlayProxy(options) : new CompanionLinkProxy(options);

        try {
            await proxy.start();
        } catch (error) {
            await proxy.stop().catch(() => undefined);
            tap.close();

            const failure = startError(error, protocol, port);
            context.logger.error('[proxy]', `${label} proxy did not start.`, failure.message);

            throw failure;
        }

        const running: RunningProxy = {
            status: {
                protocol,
                deviceId: device.id,
                target: {name: device.name, address: service.address, port: service.service.port},
                instanceName,
                port,
                pin,
                startedAt: Date.now(),
                capturePath
            },
            proxy,
            tap,
            context
        };

        this.#running.set(protocol, running);
        context.logger.info('[proxy]', `${label} proxy for ${device.name} advertised as '${instanceName}' on port ${port}.`);

        return {...running.status, messages: {...tap.counts}};
    }
}

async function createCapturePath(protocol: ProxyProtocol): Promise<string> {
    await mkdir(CAPTURE_DIRECTORY, {recursive: true, mode: 0o700});

    return join(CAPTURE_DIRECTORY, `${protocol}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
}

/** Turns a failed listen into a message that says what to do. */
function startError(error: unknown, protocol: ProxyProtocol, port: number): Error {
    const code = (error as NodeJS.ErrnoException)?.code;

    if (code === 'EADDRINUSE') {
        const hint = protocol === 'airplay' && port === 7000
            ? 'On macOS the AirPlay Receiver holds it. Turn that off in System Settings > General > AirDrop & Handoff, or start the proxy on another port.'
            : 'Stop what uses it, or start the proxy on another port.';

        return new Error(`Port ${port} is already in use. ${hint}`, {cause: error});
    }

    if (code === 'EACCES') {
        return new Error(`No permission to listen on port ${port}. Pick a port above 1023.`, {cause: error});
    }

    return error instanceof Error ? error : new Error(String(error));
}
