import { createHash } from 'node:crypto';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { generateActiveRemoteId, generateDacpId, generateSessionId } from '@corewire/airplay';
import { buildResponse } from '@corewire/airplay/rtsp';
import { HKDF } from '@corewire/core/crypto';
import { type DiscoveryResult, MdnsResponder } from '@corewire/core/discovery';
import { Plist } from '@corewire/core/encoding';
import { type AccessoryCredentials, type AccessoryIdentity, PairSetupServer, PairVerify, PairVerifyServer } from '@corewire/core/pairing';
import type { Context } from '@corewire/core/transport';
import { listen, type ProtocolProxy } from '../core/protocolProxy';
import type { ProxyTap } from '../core/tap';
import type { ProxyStore } from '../store';
import { DataChannelServer, EventChannelServer } from './channelServer';
import { ControlConnection, type ControlMessage } from './controlConnection';

const SERVICE_TYPE = '_airplay._tcp.local';

/** The proxy answers these itself and never relays them. */
const PAIRING_PATHS = ['/pair-pin-start', '/pair-setup', '/pair-verify'];

export type AirPlayProxyOptions = {
    /** Tags the logs and the tapped traffic, normally with the id of the device relayed to. */
    readonly context: Context;
    readonly device: DiscoveryResult;
    readonly credentials: AccessoryCredentials;
    readonly store: ProxyStore;
    readonly tap: ProxyTap;
    readonly pin: string;
    readonly listenPort: number;
    readonly instanceName: string;
};

/**
 * Man-in-the-middle proxy for AirPlay. It advertises itself as a receiver, answers the HAP pairing of
 * the controller on the `/pair-*` endpoints and connects to the device with the stored credentials. It
 * relays and logs the decrypted RTSP traffic, plus the event and data channels from SETUP. Audio and
 * timing are not relayed.
 */
export class AirPlayProxy implements ProtocolProxy {
    readonly name = 'airplay';

    readonly #context: Context;
    readonly #options: AirPlayProxyOptions;
    #responder?: MdnsResponder;
    #server?: Server;

    constructor(options: AirPlayProxyOptions) {
        this.#context = options.context;
        this.#options = options;
    }

    /** @throws {Error} When the port cannot be bound, such as `EADDRINUSE`. */
    async start(): Promise<void> {
        const identity = this.#options.store.accessoryIdentity(`airplay:${this.#options.device.id}`);
        const host = `${sanitize(this.#options.instanceName)}.local`;

        this.#server = createServer((socket) => {
            this.#context.logger.info('[proxy]', `Controller connected from ${socket.remoteAddress}`);
            new AirPlaySession(this.#context, this.#options, identity).start(socket);
        });

        await listen(this.#server, this.#options.listenPort);

        this.#responder = new MdnsResponder(this.#context.logger, {
            instance: this.#options.instanceName,
            type: SERVICE_TYPE,
            host,
            port: this.#options.listenPort,
            txt: proxyTxt(identity, this.#options.device.txt ?? {})
        });
        this.#responder.start();

        this.#context.logger.info('[proxy]', `Listening for AirPlay controllers on port ${this.#options.listenPort}. Pair with PIN ${this.#options.pin}.`);
    }

    async stop(): Promise<void> {
        this.#responder?.stop();
        this.#server?.close();
    }
}

/** Relays the control channel of one controller to the device. */
class AirPlaySession {
    readonly #context: Context;
    readonly #options: AirPlayProxyOptions;
    readonly #pairServer: PairSetupServer;
    readonly #verifyServer: PairVerifyServer;
    readonly #deviceHeaders: Record<string, string>;

    #controller?: ControlConnection;
    #device?: ControlConnection;
    #deviceReady = false;
    #deviceCSeq = 0;
    #deviceSharedSecret?: Buffer;
    #devicePending?: (message: ControlMessage) => void;
    #pendingBytes = 0;
    #pending: Buffer[] = [];
    #channels: (EventChannelServer | DataChannelServer)[] = [];

    /** @param identity - What the proxy presents to the controller. */
    constructor(context: Context, options: AirPlayProxyOptions, identity: AccessoryIdentity) {
        this.#context = context;
        this.#options = options;
        this.#pairServer = new PairSetupServer(context, identity, options.pin);
        this.#verifyServer = new PairVerifyServer(context, identity, (pairingId) => options.store.controller(pairingId));

        this.#deviceHeaders = {
            'Active-Remote': generateActiveRemoteId(),
            'DACP-ID': generateDacpId(),
            'User-Agent': 'AirPlay/779.32.1',
            'X-Apple-ProtocolVersion': '1',
            'X-Apple-Session-ID': generateSessionId()
        };
    }

    /** Takes the socket of the controller and connects to the device. */
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

    /** Answers a pairing request itself and relays everything else to the device. */
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
     * Starts a local server for each event and data channel the device assigned in its SETUP response
     * and puts the local ports in the response for the controller. Returns the original bytes when the
     * shared secrets are not ready or nothing changed.
     *
     * @param request - Carries the data stream seed.
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

    /** Answers a pairing request of the controller with the server side of HAP pairing. */
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
            const {readKey, writeKey} = HKDF.deriveEncryptionKeys(this.#verifyServer.sharedSecret, 'Control-Salt', 'Control-Write-Encryption-Key', 'Control-Read-Encryption-Key');

            this.#controller?.enableEncryption(readKey, writeKey);
            this.#context.logger.info('[proxy]', 'Controller pair-verify complete; control channel encrypted.');
        }
    }

    /** Pair-verifies with the device as an AirPlay client, then sends the requests that waited for it. */
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

        const verify = new PairVerify(this.#context, async (tlv) => {
            const response = await this.#deviceExchange(this.#buildDeviceRequest('/pair-verify', tlv));

            return response.kind === 'response' ? response.body : Buffer.alloc(0);
        });

        const keys = await verify.start(this.#options.credentials);
        const {readKey, writeKey} = HKDF.deriveEncryptionKeys(keys.sharedSecret, 'Control-Salt', 'Control-Read-Encryption-Key', 'Control-Write-Encryption-Key');

        this.#deviceSharedSecret = keys.sharedSecret;
        device.enableEncryption(readKey, writeKey);

        this.#context.logger.info('[proxy]', 'Device pair-verify complete; relaying control channel.');
        this.#deviceReady = true;

        for (const raw of this.#pending) {
            device.send(raw);
        }

        this.#pending = [];
        this.#pendingBytes = 0;
    }

    /** Returns the response of the device, or null when the request waits for the device session. */
    async #relayToDevice(raw: Buffer): Promise<Extract<ControlMessage, {kind: 'response'}> | null> {
        if (!this.#deviceReady || !this.#device) {
            this.#pendingBytes += raw.length;
            if (this.#pendingBytes > 1024 * 1024) {this.#teardown(); return null;}
            this.#pending.push(raw);
            return null;
        }

        const response = await this.#deviceExchange(raw);

        return response.kind === 'response' ? response : null;
    }

    /** Resolves with the next message from the device. */
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

    /** Builds an RTSP request for the pair-verify with the device, with a TLV8 body. */
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

    #teardown(): void {
        this.#pending = [];
        this.#pendingBytes = 0;
        this.#deviceReady = false;

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

/** Copies the bytes into their own ArrayBuffer, which `Plist.parse` needs. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/** Printable bodies log as text, the rest as hex. */
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

/** Reads the protocol from the first line of a request. */
function requestProtocol(raw: Buffer): 'RTSP/1.0' | 'HTTP/1.1' {
    const lineEnd = raw.indexOf('\r\n');
    const line = raw.toString('latin1', 0, lineEnd < 0 ? raw.byteLength : lineEnd);

    return line.endsWith('HTTP/1.1') ? 'HTTP/1.1' : 'RTSP/1.0';
}

/**
 * Copies the TXT record of the device and replaces `pk`, `pi` and `deviceid` with stable values of the
 * proxy, so a controller sees a different device and runs a fresh pair-setup.
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

/** Turns a name into a DNS host label. */
function sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apple-protocols-proxy';
}
