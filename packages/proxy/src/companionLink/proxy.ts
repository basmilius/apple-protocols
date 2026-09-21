import { createHash } from 'node:crypto';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { type AccessoryCredentials, type AccessoryIdentity, AccessoryPairServer, AccessoryVerify, AccessoryVerifyServer, Context, deriveEncryptionKeys, type DiscoveryResult } from '@basmilius/apple-common';
import { OPack } from '@basmilius/apple-encoding';
import { FrameType, PairingFrameTypes } from '@basmilius/apple-companion-link';
import { FramedConnection } from '../core/framedConnection';
import { MdnsResponder } from '../core/mdnsResponder';
import type { ProtocolProxy } from '../core/protocolProxy';
import type { ProxyTap } from '../core/tap';
import type { ProxyStore } from '../store';

/** Frame types sent and received in plaintext (before the encrypted session is established). */
const PLAINTEXT_TYPES = [FrameType.NoOp, FrameType.PairSetupStart, FrameType.PairSetupNext, FrameType.PairVerifyStart, FrameType.PairVerifyNext];

/** Companion Link service type advertised over mDNS. */
const SERVICE_TYPE = '_companion-link._tcp.local';

/** Configuration for a {@link CompanionLinkProxy}. */
export type CompanionLinkProxyOptions = {
    /** The real target device (Apple TV/HomePod) to relay traffic to. */
    readonly device: DiscoveryResult;
    /** The proxy's own client credentials for pair-verifying with the real device. */
    readonly credentials: AccessoryCredentials;
    /** Persistent store for the proxy's accessory identity and known controllers. */
    readonly store: ProxyStore;
    /** Tap that records the relayed plaintext messages. */
    readonly tap: ProxyTap;
    /** The PIN a controller must enter to pair with the proxy. */
    readonly pin: string;
    /** The TCP port the proxy listens on for controllers. */
    readonly listenPort: number;
    /** The Bonjour instance name the proxy advertises. */
    readonly instanceName: string;
};

/**
 * A man-in-the-middle proxy for the Companion Link protocol. It advertises itself as an Apple receiver,
 * terminates a controller's pairing (so it holds the controller-side session keys), connects to the real
 * device with stored credentials, and relays the decrypted OPack traffic both ways while logging it.
 */
export class CompanionLinkProxy implements ProtocolProxy {
    readonly name = 'companion-link';

    readonly #context: Context;
    readonly #options: CompanionLinkProxyOptions;
    #responder?: MdnsResponder;
    #server?: Server;

    constructor(options: CompanionLinkProxyOptions) {
        this.#context = new Context(`proxy:${options.device.id}`);
        this.#options = options;
    }

    /** Starts the mDNS advertisement and the TCP listener for controllers. */
    async start(): Promise<void> {
        const identity = this.#options.store.accessoryIdentity(this.#options.device.id);
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

            const session = new ProxySession(this.#context, this.#options, identity);
            session.start(socket);
        });

        await new Promise<void>((resolve) => this.#server.listen(this.#options.listenPort, resolve));
        this.#context.logger.info('[proxy]', `Listening for controllers on port ${this.#options.listenPort}. Pair with PIN ${this.#options.pin}.`);
    }

    /** Stops advertising and closes the listener. */
    async stop(): Promise<void> {
        this.#responder?.stop();
        this.#server?.close();
    }
}

/**
 * A single controller↔proxy↔device relay session. Owns the two framed connections and the pairing state
 * for one controller connection.
 */
class ProxySession {
    readonly #context: Context;
    readonly #options: CompanionLinkProxyOptions;
    readonly #pairServer: AccessoryPairServer;
    readonly #verifyServer: AccessoryVerifyServer;

    #controller?: FramedConnection;
    #device?: FramedConnection;
    #deviceReady = false;
    #devicePairingResolve?: (payload: Buffer) => void;
    #pending: [type: number, payload: Buffer][] = [];

    /**
     * @param identity - The accessory identity the proxy presents to the controller.
     */
    constructor(context: Context, options: CompanionLinkProxyOptions, identity: ReturnType<ProxyStore['accessoryIdentity']>) {
        this.#context = context;
        this.#options = options;
        this.#pairServer = new AccessoryPairServer(context, identity, options.pin);
        this.#verifyServer = new AccessoryVerifyServer(context, identity, (pairingId) => options.store.controller(pairingId));
    }

    /**
     * Begins the session on an accepted controller socket.
     *
     * @param socket - The controller's TCP socket.
     */
    start(socket: Socket): void {
        const controller = new FramedConnection(this.#context, socket, PLAINTEXT_TYPES);
        this.#controller = controller;

        controller.onFrame((type, payload) => this.#onControllerFrame(type, payload));
        controller.on('close', () => this.#teardown());
        controller.on('error', (error) => {
            this.#context.logger.warn('[proxy]', 'controller connection error', error.message);
            this.#teardown();
        });
    }

    /**
     * Handles a frame received from the controller: pairing termination, or relay to the device.
     *
     * @param payload - The decrypted frame payload.
     */
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
                const {readKey, writeKey} = deriveEncryptionKeys(this.#verifyServer.sharedSecret, '', 'ClientEncrypt-main', 'ServerEncrypt-main');
                this.#controller.enableEncryption(readKey, writeKey);
                this.#context.logger.info('[proxy]', 'Controller pair-verify complete, connecting to device…');

                await this.#connectDevice();
            }

            return;
        }

        // Encrypted OPack traffic (or NoOp) — log and relay to the device.
        this.#logFrame('controller->device', type, payload);
        this.#forwardToDevice(type, payload);
    }

    /** Establishes the device-side connection and pair-verifies with the real device, then flushes. */
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
        device.on('error', (error) => {
            this.#context.logger.warn('[proxy]', 'device connection error', error.message);
            this.#teardown();
        });

        const verify = new AccessoryVerify(this.#context, (step, tlv) => {
            const frameType = step === 'm1' ? FrameType.PairVerifyStart : FrameType.PairVerifyNext;
            return this.#deviceExchange(frameType, tlv);
        });

        const keys = await verify.start(this.#options.credentials);
        const {readKey, writeKey} = deriveEncryptionKeys(keys.sharedSecret, '', 'ServerEncrypt-main', 'ClientEncrypt-main');
        device.enableEncryption(readKey, writeKey);

        this.#context.logger.info('[proxy]', 'Device pair-verify complete, relaying.');
        this.#deviceReady = true;

        for (const [type, payload] of this.#pending) {
            device.send(type, payload);
        }

        this.#pending = [];
    }

    /**
     * Handles a frame received from the device: pairing responses (during verify) or relay to controller.
     *
     * @param payload - The decrypted frame payload.
     */
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

    /**
     * Sends a pair-verify request to the device and resolves with the response TLV8 payload.
     *
     * @param frameType - The pair-verify frame type.
     * @param tlv - The TLV8-encoded request.
     * @returns The TLV8-encoded response.
     */
    #deviceExchange(frameType: number, tlv: Buffer): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Device pairing timed out.')), 30000);

            this.#devicePairingResolve = (payload) => {
                clearTimeout(timer);
                resolve(payload);
            };

            this.#device.send(frameType, Buffer.from(OPack.encode({_pd: tlv, _auTy: 4})));
        });
    }

    /**
     * Forwards a frame to the device, buffering it until the device session is ready.
     *
     * @param payload - The decrypted payload.
     */
    #forwardToDevice(type: number, payload: Buffer): void {
        if (this.#deviceReady && this.#device) {
            this.#device.send(type, payload);
        } else {
            this.#pending.push([type, payload]);
        }
    }

    /**
     * Decodes and records an OPack frame via the tap. Non-OPack frames (e.g. NoOp) are skipped.
     *
     * @param direction - The relay direction.
     * @param payload - The decrypted payload.
     */
    #logFrame(direction: 'controller->device' | 'device->controller', type: number, payload: Buffer): void {
        if (type !== FrameType.OPackEncrypted && type !== FrameType.OPackUnencrypted && type !== FrameType.OPackPacked) {
            return;
        }

        try {
            this.#options.tap.record(direction, type, OPack.decode(payload), payload, Date.now());
        } catch (error) {
            this.#context.logger.warn('[proxy]', 'failed to decode relayed frame', (error as Error).message);
        }
    }

    /** Tears down both connections. */
    #teardown(): void {
        this.#controller?.close();
        this.#device?.close();
        this.#controller = undefined;
        this.#device = undefined;
    }
}

/**
 * Preserves the real device's non-identity TXT fields and replaces identity fields with stable proxy values.
 * This forces fresh pair-setup rather than pair-verify against the real device's key.
 * Matches pyatv atvproxy overrides for rpHA/rpHN/rpAD/rpHI/rpBA/rpMRtID.
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

/** Sanitizes a name into a DNS-safe host label. */
function sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apple-protocols-proxy';
}
