import { createHash } from 'node:crypto';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { FrameType, PairingFrameTypes } from '@apple-protocols/companion-link';
import { HKDF } from '@apple-protocols/core/crypto';
import { type DiscoveryResult, MdnsResponder } from '@apple-protocols/core/discovery';
import { OPack } from '@apple-protocols/core/encoding';
import { type AccessoryCredentials, type AccessoryIdentity, PairSetupServer, PairVerify, PairVerifyServer } from '@apple-protocols/core/pairing';
import type { Context } from '@apple-protocols/core/transport';
import { FramedConnection } from '../core/framedConnection';
import { listen, type ProtocolProxy } from '../core/protocolProxy';
import type { ProxyTap } from '../core/tap';
import type { ProxyStore } from '../store';

/** These frames stay plaintext, also after the session is encrypted. */
const PLAINTEXT_TYPES = [FrameType.NoOp, FrameType.PairSetupStart, FrameType.PairSetupNext, FrameType.PairVerifyStart, FrameType.PairVerifyNext];

const SERVICE_TYPE = '_companion-link._tcp.local';

export type CompanionLinkProxyOptions = {
    /** Tags the logs and the tapped traffic, normally with the id of the device relayed to. */
    readonly context: Context;
    readonly device: DiscoveryResult;

    /** The credentials diagnostics stored for the device, used to pair-verify with it. */
    readonly credentials: AccessoryCredentials;

    readonly store: ProxyStore;
    readonly tap: ProxyTap;

    /** The PIN a controller enters to pair with the proxy. */
    readonly pin: string;

    readonly listenPort: number;
    readonly instanceName: string;
};

/**
 * Man-in-the-middle proxy for Companion Link. It advertises itself as a receiver and answers the
 * pairing of the controller, so it holds the session keys of that side. It connects to the device with
 * the stored credentials and relays and logs the decrypted OPack traffic.
 */
export class CompanionLinkProxy implements ProtocolProxy {
    readonly name = 'companion-link';

    readonly #context: Context;
    readonly #options: CompanionLinkProxyOptions;
    #responder?: MdnsResponder;
    #server?: Server;

    constructor(options: CompanionLinkProxyOptions) {
        this.#context = options.context;
        this.#options = options;
    }

    /** @throws {Error} When the port cannot be bound, such as `EADDRINUSE`. */
    async start(): Promise<void> {
        const identity = this.#options.store.accessoryIdentity(this.#options.device.id);
        const host = `${sanitize(this.#options.instanceName)}.local`;

        this.#server = createServer(socket => {
            this.#context.logger.info('[proxy]', `Controller connected from ${socket.remoteAddress}`);

            const session = new ProxySession(this.#context, this.#options, identity);
            session.start(socket);
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

        this.#context.logger.info('[proxy]', `Listening for Companion Link controllers on port ${this.#options.listenPort}. Pair with PIN ${this.#options.pin}.`);
    }

    async stop(): Promise<void> {
        this.#responder?.stop();
        this.#server?.close();
    }
}

/** Relays one controller to the device, with both connections and the pairing state of that controller. */
class ProxySession {
    readonly #context: Context;
    readonly #options: CompanionLinkProxyOptions;
    readonly #pairServer: PairSetupServer;
    readonly #verifyServer: PairVerifyServer;

    #controller?: FramedConnection;
    #device?: FramedConnection;
    #deviceReady = false;
    #devicePairingResolve?: (payload: Buffer) => void;
    #pendingBytes = 0;
    #pending: [type: number, payload: Buffer][] = [];

    /** @param identity - What the proxy presents to the controller. */
    constructor(context: Context, options: CompanionLinkProxyOptions, identity: ReturnType<ProxyStore['accessoryIdentity']>) {
        this.#context = context;
        this.#options = options;
        this.#pairServer = new PairSetupServer(context, identity, options.pin);
        this.#verifyServer = new PairVerifyServer(context, identity, pairingId => options.store.controller(pairingId));
    }

    start(socket: Socket): void {
        const controller = new FramedConnection(this.#context, socket, PLAINTEXT_TYPES);
        this.#controller = controller;

        controller.onFrame((type, payload) => this.#onControllerFrame(type, payload));
        controller.on('close', () => this.#teardown());
        controller.on('error', error => {
            this.#context.logger.warn('[proxy]', 'Controller connection failed.', error.message);
            this.#teardown();
        });
    }

    /** Answers a pairing frame itself and relays everything else to the device. */
    async #onControllerFrame(type: number, payload: Buffer): Promise<void> {
        if (type === FrameType.PairSetupStart || type === FrameType.PairSetupNext) {
            const request = OPack.decode(payload);
            const response = await this.#pairServer.handle(Buffer.from(request._pd));
            const controllerInfo = this.#pairServer.controller;

            if (controllerInfo) {
                this.#options.store.rememberController(controllerInfo.identifier, controllerInfo.longTermPublicKey);
            }

            this.#controller.send(FrameType.PairSetupNext, Buffer.from(OPack.encode({_pd: response, _pwTy: 1})));

            return;
        }

        if (type === FrameType.PairVerifyStart || type === FrameType.PairVerifyNext) {
            const request = OPack.decode(payload);
            const response = await this.#verifyServer.handle(Buffer.from(request._pd));

            this.#controller.send(FrameType.PairVerifyNext, Buffer.from(OPack.encode({_pd: response, _auTy: 4})));

            if (this.#verifyServer.pairingId && this.#verifyServer.sharedSecret) {
                const {readKey, writeKey} = HKDF.deriveEncryptionKeys(this.#verifyServer.sharedSecret, '', 'ClientEncrypt-main', 'ServerEncrypt-main');

                this.#controller.enableEncryption(readKey, writeKey);
                this.#context.logger.info('[proxy]', 'Controller pair-verify complete, connecting to the device.');

                await this.#connectDevice();
            }

            return;
        }

        this.#logFrame('controller->device', type, payload);
        this.#forwardToDevice(type, payload);
    }

    /** Pair-verifies with the device, then sends the frames that waited for it. */
    async #connectDevice(): Promise<void> {
        const socket = connect({host: this.#options.device.address, port: this.#options.device.service.port});
        const device = new FramedConnection(this.#context, socket, PLAINTEXT_TYPES);
        this.#device = device;

        await new Promise<void>((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });

        device.onFrame((type, payload) => this.#onDeviceFrame(type, payload));
        device.on('close', () => this.#teardown());
        device.on('error', error => {
            this.#context.logger.warn('[proxy]', 'Device connection failed.', error.message);
            this.#teardown();
        });

        const verify = new PairVerify(this.#context, (tlv, step) => {
            const frameType = step === 'm1' ? FrameType.PairVerifyStart : FrameType.PairVerifyNext;

            return this.#deviceExchange(frameType, tlv);
        });

        const keys = await verify.start(this.#options.credentials);
        const {readKey, writeKey} = HKDF.deriveEncryptionKeys(keys.sharedSecret, '', 'ServerEncrypt-main', 'ClientEncrypt-main');

        device.enableEncryption(readKey, writeKey);

        this.#context.logger.info('[proxy]', 'Device pair-verify complete, relaying Companion Link.');
        this.#deviceReady = true;

        for (const [type, payload] of this.#pending) {
            device.send(type, payload);
        }

        this.#pending = [];
        this.#pendingBytes = 0;
    }

    /** Pairing frames answer our own pair-verify; the rest goes to the controller. */
    #onDeviceFrame(type: number, payload: Buffer): void {
        if (PairingFrameTypes.includes(type)) {
            const decoded = OPack.decode(payload);
            const resolve = this.#devicePairingResolve;
            this.#devicePairingResolve = undefined;
            resolve?.(Buffer.from(decoded._pd));

            return;
        }

        this.#logFrame('device->controller', type, payload);
        this.#controller?.send(type, payload);
    }

    /** Sends a pair-verify TLV8 to the device and resolves with the TLV8 it answers. */
    #deviceExchange(frameType: number, tlv: Buffer): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Device pairing timed out.')), 30000);

            this.#devicePairingResolve = payload => {
                clearTimeout(timer);
                resolve(payload);
            };

            this.#device.send(frameType, Buffer.from(OPack.encode({_pd: tlv, _auTy: 4})));
        });
    }

    /** Buffers the frame until the device session is ready. */
    #forwardToDevice(type: number, payload: Buffer): void {
        if (this.#deviceReady && this.#device) {
            this.#device.send(type, payload);

            return;
        }

        this.#pendingBytes += payload.length + 4;

        if (this.#pendingBytes > 1024 * 1024) {
            this.#teardown();

            return;
        }

        this.#pending.push([type, payload]);
    }

    /** Records OPack frames in the tap and skips the rest, such as NoOp. */
    #logFrame(direction: 'controller->device' | 'device->controller', type: number, payload: Buffer): void {
        if (type !== FrameType.OPackEncrypted && type !== FrameType.OPackUnencrypted && type !== FrameType.OPackPacked) {
            return;
        }

        try {
            this.#options.tap.record(direction, type, OPack.decode(payload), payload, Date.now());
        } catch (error) {
            this.#context.logger.warn('[proxy]', 'Could not decode a relayed frame.', (error as Error).message);
        }
    }

    #teardown(): void {
        this.#pending = [];
        this.#pendingBytes = 0;
        this.#deviceReady = false;
        this.#controller?.close();
        this.#device?.close();
        this.#controller = undefined;
        this.#device = undefined;
    }
}

/**
 * Copies the TXT record of the device and replaces the identity fields (rpHA, rpHN, rpAD, rpHI, rpBA,
 * rpMRtID) with stable values of the proxy. A controller then runs a fresh pair-setup instead of a
 * pair-verify against the key of the device.
 */
function proxyTxt(identity: AccessoryIdentity, base: Record<string, string>): Record<string, string> {
    const hash = createHash('sha256').update(identity.publicKey).digest('hex');

    return {
        ...base,
        rpHA: hash.slice(0, 12),
        rpHN: hash.slice(12, 24),
        rpAD: hash.slice(24, 36),
        rpHI: hash.slice(36, 48),
        rpBA: identity.identifier,
        rpMRtID: hash.slice(0, 32).toUpperCase()
    };
}

/** Turns a name into a DNS host label. */
function sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apple-protocols-proxy';
}
