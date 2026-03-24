import type { Context } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { hkdf } from '@basmilius/apple-encryption';
import { buildResponse, type Method, parseRequest } from '@basmilius/apple-rtsp';
import BaseStream from './baseStream';

/**
 * Reverse HTTP event stream from the Apple TV.
 *
 * Unlike the other streams where we send requests, the event stream is a TCP
 * connection where the Apple TV acts as the HTTP client, sending reverse-RTSP
 * requests to us (e.g. `POST /command`). We parse these as RTSP requests and
 * respond with RTSP responses.
 *
 * The stream is encrypted with ChaCha20-Poly1305 after setup. Note that the
 * HKDF info strings are swapped compared to what you might expect: the key
 * derived from 'Events-Write-Encryption-Key' becomes our read key, because
 * these names are from the Apple TV's perspective (see CLAUDE.md for details).
 */
export default class EventStream extends BaseStream {
    /** Accumulated plaintext buffer for partial RTSP request reassembly. */
    #buffer: Buffer = Buffer.alloc(0);
    /** Accumulated encrypted data awaiting decryption (may be a partial ChaCha20 frame). */
    #encryptedBuffer: Buffer = Buffer.alloc(0);

    /**
     * @param context - Shared context with logger and device identity.
     * @param address - IP address of the AirPlay receiver.
     * @param port - TCP port for the event stream (received from SETUP response).
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.onStreamClose = this.onStreamClose.bind(this);
        this.onStreamData = this.onStreamData.bind(this);
        this.onStreamError = this.onStreamError.bind(this);

        this.on('close', this.onStreamClose);
        this.on('data', this.onStreamData);
        this.on('error', this.onStreamError);
    }

    /**
     * Disconnects the event stream, clearing all internal buffers.
     */
    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    /**
     * Sends an RTSP response back to the Apple TV over the event stream.
     *
     * @param status - HTTP status code (e.g. 200).
     * @param statusText - HTTP status text (e.g. 'OK').
     * @param headers - Optional response headers.
     * @param body - Optional response body.
     */
    respond(status: number, statusText: string, headers?: Record<string, string | number>, body?: Buffer): void {
        let data = buildResponse({status, statusText, headers, body});

        if (this.isEncrypted) {
            data = this.encrypt(data);
        }

        this.write(data);
    }

    /**
     * Derives encryption keys from the shared secret and enables encryption.
     *
     * The key swap is intentional: HKDF info strings are named from the Apple TV's
     * perspective. 'Events-Write-Encryption-Key' produces what the Apple TV writes
     * to us (our read key), and 'Events-Read-Encryption-Key' produces what the
     * Apple TV reads from us (our write key).
     *
     * @param sharedSecret - Shared secret from pair-verify.
     */
    setup(sharedSecret: Buffer): void {
        const readKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from('Events-Salt'),
            info: Buffer.from('Events-Read-Encryption-Key')
        });

        const writeKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from('Events-Salt'),
            info: Buffer.from('Events-Write-Encryption-Key')
        });

        this.enableEncryption(writeKey, readKey);
    }

    /**
     * Resets internal buffers to a clean state.
     */
    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);
    }

    /**
     * Handles an incoming reverse-RTSP request from the Apple TV.
     *
     * Currently handles `POST /command` events by parsing the plist body
     * and responding with 200 OK.
     *
     * @param method - HTTP method of the request.
     * @param path - Request path.
     * @param headers - Request headers.
     * @param body - Request body.
     */
    async #handle(method: Method, path: string, headers: Record<string, string>, body: Buffer): Promise<void> {
        const key = `${method} ${path}`;

        switch (key) {
            case 'POST /command':
                const data = Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as any) as any;

                this.context.logger.info('[event]', 'Received event stream request.', data);

                this.respond(200, 'OK', {
                    'Audio-Latency': 0,
                    'CSeq': headers['CSeq'] ?? 0
                });
                break;

            default:
                this.context.logger.warn('[event]', 'No handler for url', key);
                this.respond(200, 'OK', { 'CSeq': headers['CSeq'] ?? 0 });
                break;
        }
    }

    /**
     * Handles stream close by clearing buffers.
     */
    onStreamClose(): void {
        this.#cleanup();
    }

    /**
     * Handles stream errors by logging them.
     *
     * @param err - The error that occurred.
     */
    onStreamError(err: Error): void {
        this.context.logger.error('[event]', 'onStreamError()', err);
    }

    /**
     * Processes incoming TCP data from the event stream.
     *
     * Handles the two-buffer pattern: encrypted data accumulates in
     * `#encryptedBuffer` until a complete ChaCha20 frame can be decrypted,
     * then the plaintext is appended to `#buffer` for RTSP request parsing.
     * This separation prevents mixing plaintext with encrypted data on
     * partial TCP deliveries.
     *
     * @param data - Raw data from the TCP socket.
     */
    async onStreamData(data: Buffer): Promise<void> {
        try {
            if (this.isEncrypted) {
                this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, data]);

                const decrypted = this.decrypt(this.#encryptedBuffer);

                if (!decrypted) {
                    return;
                }

                this.#encryptedBuffer = Buffer.alloc(0);
                this.#buffer = Buffer.concat([this.#buffer, decrypted]);
            } else {
                this.#buffer = Buffer.concat([this.#buffer, data]);
            }

            while (this.#buffer.byteLength > 0) {
                const result = parseRequest(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.requestLength);
                await this.#handle(result.method, result.path, result.headers, result.body);
            }
        } catch (err) {
            this.context.logger.error('[event]', 'onStreamData()', err);
            this.emit('error', err);
        }
    }
}
