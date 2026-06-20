import { connect, createServer, type Server, type Socket } from 'node:net';
import { type Context, deriveEncryptionKeys } from '@basmilius/apple-common';
import { parseMessages } from '@basmilius/apple-airplay';
import { parseRequest, parseResponse } from '@basmilius/apple-rtsp';
import { AirPlayCipher, ChannelRelay, type RelayDirection, type RelayLogger } from './channelRelay';
import type { ProxyTap } from '../core/tap';

/** Size of the AirPlay DataStream frame header. */
const DATA_HEADER_LENGTH = 32;

/**
 * Base for an AirPlay side-channel proxy server. Listens on an ephemeral local port; when the controller
 * connects, it dials the real device's channel port and starts a {@link ChannelRelay} with per-side ciphers
 * derived from the respective pairing's shared secret. Subclasses provide the ciphers and the logger.
 */
abstract class ChannelServer {
    protected readonly context: Context;
    protected readonly deviceAddress: string;
    protected readonly devicePort: number;
    protected readonly tap: ProxyTap;
    #server?: Server;

    /**
     * @param context - Shared context for logging.
     * @param deviceAddress - The real device's IP address.
     * @param devicePort - The real device's channel port (from the SETUP response).
     * @param tap - The tap that records relayed messages.
     */
    constructor(context: Context, deviceAddress: string, devicePort: number, tap: ProxyTap) {
        this.context = context;
        this.deviceAddress = deviceAddress;
        this.devicePort = devicePort;
        this.tap = tap;
    }

    /**
     * Starts listening on an ephemeral local port.
     *
     * @returns The bound local port to advertise back to the controller in the rewritten SETUP response.
     */
    async listen(): Promise<number> {
        const server = createServer((socket) => this.#handle(socket));
        this.#server = server;

        await new Promise<void>((resolve) => server.listen(0, resolve));

        return (server.address() as {port: number}).port;
    }

    /** Stops the channel server. */
    stop(): void {
        this.#server?.close();
    }

    /**
     * Bridges an accepted controller connection to the real device.
     *
     * @param controllerSocket - The controller's socket.
     */
    #handle(controllerSocket: Socket): void {
        const deviceSocket = connect({host: this.deviceAddress, port: this.devicePort});
        const {controller, device} = this.ciphers();

        new ChannelRelay(this.context, controllerSocket, controller, deviceSocket, device, this.logger()).start();
    }

    /** Builds the controller- and device-facing ciphers for this channel. */
    protected abstract ciphers(): {controller: AirPlayCipher; device: AirPlayCipher};

    /** Builds the stateful logger that decodes and records this channel's traffic. */
    protected abstract logger(): RelayLogger;
}

/**
 * Proxies the AirPlay reverse **event** channel: the device acts as the HTTP client (`POST /command`), so
 * device→controller traffic is parsed as RTSP requests and controller→device as RTSP responses.
 */
export class EventChannelServer extends ChannelServer {
    readonly #controllerSharedSecret: Buffer;
    readonly #deviceSharedSecret: Buffer;

    /**
     * @param context - Shared context for logging.
     * @param deviceAddress - The real device's IP address.
     * @param devicePort - The device's event port (from the SETUP response).
     * @param controllerSharedSecret - The controller↔proxy pair-verify shared secret.
     * @param deviceSharedSecret - The proxy↔device pair-verify shared secret.
     * @param tap - The tap that records relayed messages.
     */
    constructor(context: Context, deviceAddress: string, devicePort: number, controllerSharedSecret: Buffer, deviceSharedSecret: Buffer, tap: ProxyTap) {
        super(context, deviceAddress, devicePort, tap);

        this.#controllerSharedSecret = controllerSharedSecret;
        this.#deviceSharedSecret = deviceSharedSecret;
    }

    /** @inheritDoc */
    protected ciphers(): {controller: AirPlayCipher; device: AirPlayCipher} {
        const c = deriveEncryptionKeys(this.#controllerSharedSecret, 'Events-Salt', 'Events-Read-Encryption-Key', 'Events-Write-Encryption-Key');
        const d = deriveEncryptionKeys(this.#deviceSharedSecret, 'Events-Salt', 'Events-Read-Encryption-Key', 'Events-Write-Encryption-Key');

        // Controller side: the proxy is the "receiver" — read what the controller writes (Events-Read), write
        // what it reads (Events-Write). Device side: the proxy is the "controller" — mirror of EventStream.
        return {
            controller: new AirPlayCipher(c.readKey, c.writeKey),
            device: new AirPlayCipher(d.writeKey, d.readKey)
        };
    }

    /** @inheritDoc */
    protected logger(): RelayLogger {
        let requestBuffer = Buffer.alloc(0);
        let responseBuffer = Buffer.alloc(0);

        return (direction: RelayDirection, plaintext: Buffer) => {
            if (direction === 'device->controller') {
                requestBuffer = Buffer.concat([requestBuffer, plaintext]);

                for (let request = parseRequest(requestBuffer); request; request = parseRequest(requestBuffer)) {
                    this.tap.record('device->controller', 0, {method: request.method, path: request.path, headers: request.headers, body: describeBody(request.body)}, requestBuffer.subarray(0, request.requestLength), Date.now());
                    requestBuffer = requestBuffer.subarray(request.requestLength);
                }
            } else {
                responseBuffer = Buffer.concat([responseBuffer, plaintext]);

                for (let parsed = parseResponse(responseBuffer); parsed; parsed = parseResponse(responseBuffer)) {
                    this.tap.record('controller->device', 0, {status: parsed.response.status, statusText: parsed.response.statusText}, responseBuffer.subarray(0, parsed.responseLength), Date.now());
                    responseBuffer = responseBuffer.subarray(parsed.responseLength);
                }
            }
        };
    }
}

/**
 * Proxies the AirPlay **data stream** (MRP/MediaRemote protobufs). Both peers send and receive; the relay
 * forwards verbatim and best-effort-decodes the embedded `ProtocolMessage` protobufs for logging.
 */
export class DataChannelServer extends ChannelServer {
    readonly #controllerSharedSecret: Buffer;
    readonly #deviceSharedSecret: Buffer;
    readonly #seed: unknown;

    /**
     * @param context - Shared context for logging.
     * @param deviceAddress - The real device's IP address.
     * @param devicePort - The device's data port (from the SETUP response).
     * @param controllerSharedSecret - The controller↔proxy pair-verify shared secret.
     * @param deviceSharedSecret - The proxy↔device pair-verify shared secret.
     * @param seed - The DataStream seed from the SETUP request (part of the HKDF salt).
     * @param tap - The tap that records relayed messages.
     */
    constructor(context: Context, deviceAddress: string, devicePort: number, controllerSharedSecret: Buffer, deviceSharedSecret: Buffer, seed: unknown, tap: ProxyTap) {
        super(context, deviceAddress, devicePort, tap);

        this.#controllerSharedSecret = controllerSharedSecret;
        this.#deviceSharedSecret = deviceSharedSecret;
        this.#seed = seed;
    }

    /** @inheritDoc */
    protected ciphers(): {controller: AirPlayCipher; device: AirPlayCipher} {
        const salt = `DataStream-Salt${this.#seed}`;
        const c = deriveEncryptionKeys(this.#controllerSharedSecret, salt, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key');
        const d = deriveEncryptionKeys(this.#deviceSharedSecret, salt, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key');

        // The client reads with Input and writes with Output (see DataStream.setup). Device side mirrors the
        // client; controller side mirrors the device (read what the controller writes = Output).
        return {
            controller: new AirPlayCipher(c.writeKey, c.readKey),
            device: new AirPlayCipher(d.readKey, d.writeKey)
        };
    }

    /** @inheritDoc */
    protected logger(): RelayLogger {
        return (direction: RelayDirection, plaintext: Buffer) => {
            const messages = decodeDataStream(plaintext);

            this.tap.record(direction, 0, messages ?? {'@bytes': plaintext.toString('hex')}, plaintext, Date.now());
        };
    }
}

/**
 * Best-effort decode of a decrypted DataStream chunk into MRP protobuf messages. The wire frame is a
 * 32-byte header followed by the payload carrying length-prefixed `ProtocolMessage` protobufs; this tries
 * the payload after the header and falls back to the whole chunk.
 *
 * @param chunk - The decrypted DataStream bytes.
 * @returns The decoded messages as JSON, or null if nothing decoded.
 */
function decodeDataStream(chunk: Buffer): unknown {
    for (const candidate of [chunk.subarray(DATA_HEADER_LENGTH), chunk]) {
        if (candidate.byteLength === 0) {
            continue;
        }

        try {
            const messages = parseMessages(candidate);

            if (messages.length > 0) {
                return messages;
            }
        } catch {
            // try the next candidate
        }
    }

    return null;
}

/** Renders an RTSP body for logging: text if printable, else hex. */
function describeBody(body: Buffer): unknown {
    if (body.byteLength === 0) {
        return null;
    }

    const text = body.toString('utf8');

    return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(text) ? text : {'@bytes': body.toString('hex')};
}
