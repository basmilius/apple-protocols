import { createHash } from 'node:crypto';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { type AccessoryCredentials, type AccessoryIdentity, AccessoryPairServer, AccessoryVerify, AccessoryVerifyServer, Context, deriveEncryptionKeys, type DiscoveryResult, generateActiveRemoteId, generateDacpId, generateSessionId } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { buildResponse } from '@basmilius/apple-rtsp';
import { ControlConnection, type ControlMessage } from './controlConnection';
import { DataChannelServer, EventChannelServer } from './channelServer';
import { MdnsResponder } from '../core/mdnsResponder';
import type { ProtocolProxy } from '../core/protocolProxy';
import type { ProxyTap } from '../core/tap';
import type { ProxyStore } from '../store';

/** AirPlay control service type advertised over mDNS. */
const SERVICE_TYPE = '_airplay._tcp.local';

/** Pairing endpoints terminated by the proxy (never relayed). */
const PAIRING_PATHS = ['/pair-pin-start', '/pair-setup', '/pair-verify'];

/** Configuration for an {@link AirPlayProxy}. */
export type AirPlayProxyOptions = {
    readonly device: DiscoveryResult;
    readonly credentials: AccessoryCredentials;
    readonly store: ProxyStore;
    readonly tap: ProxyTap;
    readonly pin: string;
    readonly listenPort: number;
    readonly instanceName: string;
};

/**
 * A man-in-the-middle proxy for the AirPlay **control** channel (RTSP on port 7000). It advertises itself
 * as an AirPlay receiver, terminates the controller's HAP pairing over the `/pair-*` endpoints, connects
 * to the real device with stored credentials, and relays the (decrypted) RTSP requests/responses both ways
 * while logging them. Audio, the reverse event channel and timing are out of scope.
 */
export class AirPlayProxy implements ProtocolProxy {
    readonly name = 'airplay';

    readonly #context: Context;
    readonly #options: AirPlayProxyOptions;
    #responder?: MdnsResponder;
    #server?: Server;

    constructor(options: AirPlayProxyOptions) {
        this.#context = new Context(`proxy:${options.device.id}`);
        this.#options = options;
    }

    /** Starts the mDNS advertisement and the RTSP listener. */
    async start(): Promise<void> {
        const identity = this.#options.store.accessoryIdentity(`airplay:${this.#options.device.id}`);
        const host = `${sanitize(this.#options.instanceName)}.local`;

        this.#responder = new MdnsResponder(this.#context, {
            instance: this.#options.instanceName,
            type: SERVICE_TYPE,
            host,
            port: this.#options.listenPort,
            txt: proxyTxt(identity, this.#options.device.txt ?? {})
        });
        this.#responder.start();

        this.#server = createServer((socket) => {
            this.#context.logger.info('[proxy]', `Controller connected from ${socket.remoteAddress}`);
            new AirPlaySession(this.#context, this.#options, identity).start(socket);
        });

        await new Promise<void>((resolve) => this.#server.listen(this.#options.listenPort, resolve));
        this.#context.logger.info('[proxy]', `Listening for AirPlay controllers on port ${this.#options.listenPort}. Pair with PIN ${this.#options.pin}.`);
    }

    /** Stops advertising and closes the listener. */
    async stop(): Promise<void> {
        this.#responder?.stop();
        this.#server?.close();
    }
}

/**
 * A single controller↔proxy↔device AirPlay control-channel relay session.
 */
class AirPlaySession {
    readonly #context: Context;
    readonly #options: AirPlayProxyOptions;
    readonly #pairServer: AccessoryPairServer;
    readonly #verifyServer: AccessoryVerifyServer;
    readonly #deviceHeaders: Record<string, string>;

    #controller?: ControlConnection;
    #device?: ControlConnection;
    #deviceReady = false;
    #deviceCSeq = 0;
    #deviceSharedSecret?: Buffer;
    #devicePending?: (message: ControlMessage) => void;
    #pending: Buffer[] = [];
    #channels: (EventChannelServer | DataChannelServer)[] = [];

    /**
     * @param identity - The accessory identity the proxy presents to the controller.
     */
    constructor(context: Context, options: AirPlayProxyOptions, identity: AccessoryIdentity) {
        this.#context = context;
        this.#options = options;
        this.#pairServer = new AccessoryPairServer(context, identity, options.pin);
        this.#verifyServer = new AccessoryVerifyServer(context, identity, (pairingId) => options.store.controller(pairingId));
        this.#deviceHeaders = {
            'Active-Remote': generateActiveRemoteId(),
            'DACP-ID': generateDacpId(),
            'User-Agent': 'AirPlay/779.32.1',
            'X-Apple-ProtocolVersion': '1',
            'X-Apple-Session-ID': generateSessionId()
        };
    }

    /**
     * Begins the session on an accepted controller socket and connects to the real device.
     *
     * @param socket - The controller's TCP socket.
     */
    start(socket: Socket): void {
        const controller = new ControlConnection(this.#context, socket, 'server');
        this.#controller = controller;

        controller.onMessage((message) => this.#onControllerMessage(message));
        controller.on('close', () => this.#teardown());
        controller.on('error', (error) => {
            this.#context.logger.warn('[proxy]', 'controller connection error', error.message);
            this.#teardown();
        });

        this.#connectDevice().catch((error) => {
            this.#context.logger.error('[proxy]', 'device connect/verify failed', error);
            this.#teardown();
        });
    }

    /**
     * Handles a control-channel request from the controller: pairing termination or relay to the device.
     *
     * @param message - The parsed control message (always a request on the server side).
     */
    async #onControllerMessage(message: ControlMessage): Promise<void> {
        if (message.kind !== 'request') {
            return;
        }

        const {request, raw} = message;
        const basePath = request.path.split('?')[0];

        if (PAIRING_PATHS.includes(basePath)) {
            await this.#handlePairing(message);
            return;
        }

        this.#options.tap.record('controller->device', 0, {method: request.method, path: request.path, headers: request.headers, body: describeBody(request.body)}, raw, Date.now());

        const response = await this.#relayToDevice(raw);

        if (response) {
            const outRaw = request.method === 'SETUP' ? await this.#interceptSetup(message, response) : response.raw;
            this.#options.tap.record('device->controller', 0, {status: response.status, statusText: response.statusText, body: describeBody(response.body)}, outRaw, Date.now());
            this.#controller?.send(outRaw);
        }
    }

    /**
     * Intercepts a SETUP response: starts local proxy servers for the event/data channels the device
     * assigned, rewrites their ports to the local ones, and returns the re-serialized response. Falls back
     * to the original bytes if the shared secrets are not ready or nothing needed rewriting.
     *
     * @param request - The controller's SETUP request (carries the data-stream seed).
     * @param response - The device's SETUP response.
     * @returns The (possibly rewritten) raw response bytes to send to the controller.
     */
    async #interceptSetup(request: ControlMessage, response: Extract<ControlMessage, {kind: 'response'}>): Promise<Buffer> {
        const controllerSharedSecret = this.#verifyServer.sharedSecret;

        if (request.kind !== 'request' || !controllerSharedSecret || !this.#deviceSharedSecret || response.body.byteLength === 0) {
            return response.raw;
        }

        const deviceSharedSecret = this.#deviceSharedSecret;

        try {
            const plist = Plist.parse(toArrayBuffer(response.body)) as any;
            let changed = false;

            if (typeof plist.eventPort === 'number' && plist.eventPort !== 0) {
                const server = new EventChannelServer(this.#context, this.#options.device.address, plist.eventPort & 0xFFFF, controllerSharedSecret, deviceSharedSecret, this.#options.tap);
                plist.eventPort = await server.listen();
                this.#channels.push(server);
                changed = true;
            }

            if (Array.isArray(plist.streams)) {
                const requestPlist = request.request.body.byteLength > 0 ? Plist.parse(toArrayBuffer(request.request.body)) as any : undefined;

                for (let index = 0; index < plist.streams.length; index++) {
                    const stream = plist.streams[index];

                    if (stream && typeof stream.dataPort === 'number' && stream.dataPort !== 0) {
                        const seed = requestPlist?.streams?.[index]?.seed ?? requestPlist?.streams?.[0]?.seed;
                        const server = new DataChannelServer(this.#context, this.#options.device.address, stream.dataPort & 0xFFFF, controllerSharedSecret, deviceSharedSecret, seed, this.#options.tap);
                        stream.dataPort = await server.listen();
                        this.#channels.push(server);
                        changed = true;
                    }
                }
            }

            if (!changed) {
                return response.raw;
            }

            this.#context.logger.info('[proxy]', 'Rewrote SETUP response — relaying event/data channels.');

            const headers = Object.fromEntries(response.headers.entries());
            delete headers['content-length'];

            return buildResponse({
                status: response.status,
                statusText: response.statusText,
                headers,
                body: Buffer.from(Plist.serialize(plist)),
                protocol: requestProtocol(response.raw)
            });
        } catch (error) {
            this.#context.logger.warn('[proxy]', 'SETUP interception failed; passing through', (error as Error).message);
            return response.raw;
        }
    }

    /**
     * Terminates a controller pairing request (`/pair-pin-start`, `/pair-setup`, `/pair-verify`) using the
     * server-side HAP state machines and replies over the control channel.
     *
     * @param message - The pairing request message.
     */
    async #handlePairing(message: ControlMessage): Promise<void> {
        if (message.kind !== 'request') {
            return;
        }

        const {request, raw} = message;
        const basePath = request.path.split('?')[0];
        const protocol = requestProtocol(raw);
        const cseq = request.headers['CSeq'];

        if (basePath === '/pair-pin-start') {
            this.#context.logger.info('[proxy]', `Controller is pairing — enter PIN ${this.#options.pin} on the controller.`);
            this.#controller?.send(buildResponse({status: 200, statusText: 'OK', protocol, headers: cseq ? {CSeq: cseq} : {}}));
            return;
        }

        const tlv = basePath === '/pair-setup'
            ? await this.#pairServer.handle(request.body)
            : await this.#verifyServer.handle(request.body);

        if (basePath === '/pair-setup') {
            const controllerInfo = this.#pairServer.controller;

            if (controllerInfo) {
                this.#options.store.rememberController(controllerInfo.identifier, controllerInfo.longTermPublicKey);
            }
        }

        this.#controller?.send(buildResponse({
            status: 200,
            statusText: 'OK',
            protocol,
            headers: {'Content-Type': 'application/octet-stream', ...(cseq ? {CSeq: cseq} : {})},
            body: tlv
        }));

        if (basePath === '/pair-verify' && this.#verifyServer.pairingId && this.#verifyServer.sharedSecret) {
            const {readKey, writeKey} = deriveEncryptionKeys(this.#verifyServer.sharedSecret, 'Control-Salt', 'Control-Write-Encryption-Key', 'Control-Read-Encryption-Key');
            this.#controller?.enableEncryption(readKey, writeKey);
            this.#context.logger.info('[proxy]', 'Controller pair-verify complete; control channel encrypted.');
        }
    }

    /**
     * Connects to the real device and pair-verifies with it (proxy as AirPlay client), then enables the
     * device-side encryption and flushes any buffered relayed requests.
     */
    async #connectDevice(): Promise<void> {
        const socket = connect({host: this.#options.device.address, port: this.#options.device.service.port});
        const device = new ControlConnection(this.#context, socket, 'client');
        this.#device = device;

        await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });

        device.onMessage((message) => {
            const resolve = this.#devicePending;
            this.#devicePending = undefined;
            resolve?.(message);
        });
        device.on('close', () => this.#teardown());
        device.on('error', (error) => {
            this.#context.logger.warn('[proxy]', 'device connection error', error.message);
            this.#teardown();
        });

        const verify = new AccessoryVerify(this.#context, async (_step, tlv) => {
            const response = await this.#deviceExchange(this.#buildDeviceRequest('/pair-verify', tlv));
            return response.kind === 'response' ? response.body : Buffer.alloc(0);
        });

        const keys = await verify.start(this.#options.credentials);
        this.#deviceSharedSecret = keys.sharedSecret;
        const {readKey, writeKey} = deriveEncryptionKeys(keys.sharedSecret, 'Control-Salt', 'Control-Read-Encryption-Key', 'Control-Write-Encryption-Key');
        device.enableEncryption(readKey, writeKey);

        this.#context.logger.info('[proxy]', 'Device pair-verify complete; relaying control channel.');
        this.#deviceReady = true;

        for (const raw of this.#pending) {
            device.send(raw);
        }

        this.#pending = [];
    }

    /**
     * Relays a raw RTSP request to the device and resolves with the device's response, buffering until the
     * device session is ready.
     *
     * @param raw - The raw RTSP request bytes from the controller.
     * @returns The device's response message, or null if the device is not ready.
     */
    async #relayToDevice(raw: Buffer): Promise<Extract<ControlMessage, {kind: 'response'}> | null> {
        if (!this.#deviceReady || !this.#device) {
            this.#pending.push(raw);
            return null;
        }

        const response = await this.#deviceExchange(raw);

        return response.kind === 'response' ? response : null;
    }

    /**
     * Sends raw RTSP bytes to the device and resolves with the next response message.
     *
     * @param raw - The raw RTSP request bytes.
     * @returns The next response message from the device.
     */
    #deviceExchange(raw: Buffer): Promise<ControlMessage> {
        return new Promise<ControlMessage>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Device control exchange timed out.')), 30000);

            this.#devicePending = (message) => {
                clearTimeout(timer);
                resolve(message);
            };

            this.#device.send(raw);
        });
    }

    /**
     * Builds a raw RTSP request for the device side (used during device pair-verify).
     *
     * @param path - The request path.
     * @param body - The request body (TLV8).
     * @returns The serialized RTSP request bytes.
     */
    #buildDeviceRequest(path: string, body: Buffer): Buffer {
        const headers: Record<string, string> = {
            ...this.#deviceHeaders,
            'CSeq': String(this.#deviceCSeq++),
            'Content-Type': 'application/octet-stream',
            'X-Apple-HKP': '3',
            'Content-Length': String(body.byteLength)
        };

        const head = [`POST ${path} RTSP/1.0`, ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`), '', ''].join('\r\n');

        return Buffer.concat([Buffer.from(head), body]);
    }

    /** Tears down both connections and any channel servers. */
    #teardown(): void {
        for (const channel of this.#channels) {
            channel.stop();
        }

        this.#channels = [];
        this.#controller?.close();
        this.#device?.close();
        this.#controller = undefined;
        this.#device = undefined;
    }
}

/** Returns a standalone ArrayBuffer view of a Buffer (for Plist.parse). */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/** Renders a request/response body for logging: a binary plist or text preview, else hex. */
function describeBody(body: Buffer): unknown {
    if (body.byteLength === 0) {
        return null;
    }

    const text = body.toString('utf8');

    if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(text)) {
        return text;
    }

    return {'@bytes': body.toString('hex')};
}

/** Extracts the protocol token (RTSP/1.0 or HTTP/1.1) from a raw request's first line. */
function requestProtocol(raw: Buffer): 'RTSP/1.0' | 'HTTP/1.1' {
    const lineEnd = raw.indexOf('\r\n');
    const line = raw.toString('latin1', 0, lineEnd < 0 ? raw.byteLength : lineEnd);

    return line.endsWith('HTTP/1.1') ? 'HTTP/1.1' : 'RTSP/1.0';
}

/**
 * Builds the `_airplay._tcp` TXT record for the proxy: the real device's properties with the identity
 * fields (`pk`, `pi`, `deviceid`) replaced by proxy-specific stable values so a controller treats the
 * proxy as a distinct device and performs a fresh pair-setup.
 *
 * @param identity - The proxy's accessory identity.
 * @param base - The real device's TXT properties.
 * @returns The TXT record to advertise.
 */
function proxyTxt(identity: AccessoryIdentity, base: Record<string, string>): Record<string, string> {
    const hash = createHash('sha256').update(identity.publicKey).digest('hex');

    return {
        ...base,
        pk: identity.publicKey.toString('hex'),
        pi: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`,
        deviceid: identity.identifier
    };
}

/** Sanitizes a name into a DNS-safe host label. */
function sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apple-protocols-proxy';
}
