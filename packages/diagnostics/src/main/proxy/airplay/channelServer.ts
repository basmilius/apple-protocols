import { connect, createServer, type Server, type Socket } from 'node:net';
import type { Context } from '@corewire/core/transport';
import { HKDF } from '@corewire/core/crypto';
import { parseRequest, parseResponse } from '@corewire/airplay/rtsp';
import { parseMessages } from '@corewire/airplay/mrp';
import { AirPlayCipher, ChannelRelay, type RelayDirection, type RelayLogger } from './channelRelay';
import type { ProxyTap } from '../core/tap';

/** Size of the AirPlay DataStream frame header. */
const DATA_HEADER_LENGTH = 32;

/**
 * Listens for one AirPlay side channel on an ephemeral port. When the controller connects, it dials the
 * channel port of the device and starts a {@link ChannelRelay}. Subclasses provide the ciphers and the
 * logger.
 */
abstract class ChannelServer {
    protected readonly context: Context;
    protected readonly deviceAddress: string;
    protected readonly devicePort: number;
    protected readonly tap: ProxyTap;
    #server?: Server;

    /** @param devicePort - The channel port of the device, from its SETUP response. */
    constructor(context: Context, deviceAddress: string, devicePort: number, tap: ProxyTap) {
        this.context = context;
        this.deviceAddress = deviceAddress;
        this.devicePort = devicePort;
        this.tap = tap;
    }

    /** Returns the local port, which goes into the rewritten SETUP response for the controller. */
    async listen(): Promise<number> {
        const server = createServer((socket) => this.#handle(socket));
        this.#server = server;

        await new Promise<void>((resolve) => server.listen(0, resolve));

        return (server.address() as {port: number}).port;
    }

    stop(): void {
        this.#server?.close();
    }

    #handle(controllerSocket: Socket): void {
        const deviceSocket = connect({host: this.deviceAddress, port: this.devicePort});
        const {controller, device} = this.ciphers();

        new ChannelRelay(this.context, controllerSocket, controller, deviceSocket, device, this.logger()).start();
    }

    protected abstract ciphers(): {controller: AirPlayCipher; device: AirPlayCipher};

    /** Builds a stateful logger that decodes and records the traffic of this channel. */
    protected abstract logger(): RelayLogger;
}

/**
 * Proxies the reverse event channel. The device is the HTTP client here (`POST /command`), so traffic
 * from the device parses as RTSP requests and traffic from the controller as RTSP responses.
 */
export class EventChannelServer extends ChannelServer {
    readonly #controllerSharedSecret: Buffer;
    readonly #deviceSharedSecret: Buffer;

    /**
     * @param controllerSharedSecret - From the pair-verify between controller and proxy.
     * @param deviceSharedSecret - From the pair-verify between proxy and device.
     */
    constructor(context: Context, deviceAddress: string, devicePort: number, controllerSharedSecret: Buffer, deviceSharedSecret: Buffer, tap: ProxyTap) {
        super(context, deviceAddress, devicePort, tap);

        this.#controllerSharedSecret = controllerSharedSecret;
        this.#deviceSharedSecret = deviceSharedSecret;
    }

    /** @inheritDoc */
    protected ciphers(): {controller: AirPlayCipher; device: AirPlayCipher} {
        const c = HKDF.deriveEncryptionKeys(this.#controllerSharedSecret, 'Events-Salt', 'Events-Read-Encryption-Key', 'Events-Write-Encryption-Key');
        const d = HKDF.deriveEncryptionKeys(this.#deviceSharedSecret, 'Events-Salt', 'Events-Read-Encryption-Key', 'Events-Write-Encryption-Key');

        // Toward the controller the proxy is the receiver, so it reads with Events-Read and writes with
        // Events-Write. Toward the device it is the controller, so the keys swap as in EventChannel.
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
 * Proxies the data stream with the MRP protobufs. The relay forwards the plaintext as is and tries to
 * decode the `ProtocolMessage` protobufs in it for the log.
 */
export class DataChannelServer extends ChannelServer {
    readonly #controllerSharedSecret: Buffer;
    readonly #deviceSharedSecret: Buffer;
    readonly #seed: unknown;

    /**
     * @param controllerSharedSecret - From the pair-verify between controller and proxy.
     * @param deviceSharedSecret - From the pair-verify between proxy and device.
     * @param seed - From the SETUP request, part of the HKDF salt.
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
        const c = HKDF.deriveEncryptionKeys(this.#controllerSharedSecret, salt, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key');
        const d = HKDF.deriveEncryptionKeys(this.#deviceSharedSecret, salt, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key');

        // A client reads with Input and writes with Output. Toward the device the proxy is the client;
        // toward the controller it is the device, so it reads with Output.
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
 * Decodes the MRP messages in a decrypted data stream chunk, or returns null. A frame is a 32-byte
 * header and length-prefixed `ProtocolMessage` protobufs, so this tries the bytes after the header
 * first and then the whole chunk.
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
            // Not MRP from this offset, try the next candidate.
        }
    }

    return null;
}

/** Printable bodies log as text, the rest as hex. */
function describeBody(body: Buffer): unknown {
    if (body.byteLength === 0) {
        return null;
    }

    const text = body.toString('utf8');

    return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(text) ? text : {'@bytes': body.toString('hex')};
}
