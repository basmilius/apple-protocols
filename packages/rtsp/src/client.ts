import { Connection, ConnectionClosedError, ConnectionTimeoutError, type Context, HTTP_TIMEOUT, InvalidResponseError, TimeoutError } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { type Method, parseResponse } from './encoding';

/**
 * Represents a pending RTSP request awaiting its response, tracked by CSeq number.
 */
type PendingRequest = {
    /** Resolves the pending promise with the received response. */
    resolve: (response: Response) => void;
    /** Rejects the pending promise with an error (e.g. timeout, connection closed). */
    reject: (error: Error) => void;
};

/**
 * Options for configuring an RTSP/HTTP request-response exchange.
 */
export type ExchangeOptions = {
    /** Explicit Content-Type header. Automatically set to `application/x-apple-binary-plist` when body is a plain object. */
    contentType?: string;
    /** Additional headers to include in the request. Merged after default headers. */
    headers?: Record<string, string>;
    /** Request body. Plain objects are serialized as binary plist; strings and buffers are sent as-is. */
    body?: Buffer | string | Record<string, unknown>;
    /** When `true`, non-OK responses resolve instead of rejecting with {@link InvalidResponseError}. */
    allowError?: boolean;
    /** Protocol version for the request line. Defaults to `'RTSP/1.0'`. */
    protocol?: 'RTSP/1.0' | 'HTTP/1.1';
    /** Response timeout in milliseconds. Defaults to `HTTP_TIMEOUT`. */
    timeout?: number;
};

/** Maximum allowed buffer size (2 MB) before resetting to prevent memory exhaustion. */
const MAX_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * RTSP client for Apple protocol communication over TCP.
 *
 * Extends {@link Connection} with RTSP-specific request/response handling, including
 * CSeq-based request tracking, automatic body serialization (binary plist for objects),
 * and support for encryption via overridable transform hooks. Maintains separate buffers
 * for encrypted and decrypted data to prevent corruption during partial TCP delivery.
 *
 * Subclasses should override {@link transformIncoming} and {@link transformOutgoing} to
 * add encryption/decryption, and {@link getDefaultHeaders} to inject per-request headers.
 */
export default class RtspClient extends Connection<{}> {
    /** Accumulates decrypted plaintext data waiting to be parsed as RTSP responses. */
    #buffer: Buffer = Buffer.alloc(0);
    /** Accumulates raw encrypted TCP data before transformation/decryption. */
    #encryptedBuffer: Buffer = Buffer.alloc(0);
    /** Monotonically increasing RTSP CSeq counter for request tracking. */
    #cseq: number = 0;
    /** Map of in-flight requests keyed by CSeq, awaiting their matching response. */
    #requests: Map<number, PendingRequest> = new Map();

    /**
     * Creates a new RTSP client and binds internal event handlers.
     *
     * @param context - Device context providing logger and configuration.
     * @param address - The target host address to connect to.
     * @param port - The target TCP port to connect to.
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.onRtspClose = this.onRtspClose.bind(this);
        this.onRtspData = this.onRtspData.bind(this);
        this.onRtspError = this.onRtspError.bind(this);
        this.onRtspTimeout = this.onRtspTimeout.bind(this);

        this.on('close', this.onRtspClose);
        this.on('data', this.onRtspData);
        this.on('error', this.onRtspError);
        this.on('timeout', this.onRtspTimeout);
    }

    /**
     * Returns default headers that are included in every outgoing request.
     *
     * Override in subclasses to inject session-specific headers (e.g. DACP-ID,
     * Active-Remote). These headers are placed after CSeq but before any
     * per-request headers from {@link ExchangeOptions.headers}.
     *
     * @returns A record of header name-value pairs.
     */
    protected getDefaultHeaders(): Record<string, string | number> {
        return {};
    }

    /**
     * Transforms incoming raw TCP data before RTSP response parsing.
     *
     * Override in subclasses to perform decryption. Return `false` if the buffer
     * does not yet contain enough data for a complete decryption block, signaling
     * that more data should be accumulated before retrying.
     *
     * @param data - The raw (potentially encrypted) incoming data buffer.
     * @returns The transformed (decrypted) buffer, or `false` if more data is needed.
     */
    protected transformIncoming(data: Buffer): Buffer | false {
        return data;
    }

    /**
     * Transforms outgoing data after RTSP request formatting.
     *
     * Override in subclasses to perform encryption on the fully formatted
     * request buffer before it is written to the socket.
     *
     * @param data - The fully formatted RTSP request buffer (headers + body).
     * @returns The transformed (encrypted) buffer ready for transmission.
     */
    protected transformOutgoing(data: Buffer): Buffer {
        return data;
    }

    /**
     * Sends an RTSP/HTTP request and waits for the matching response.
     *
     * Automatically assigns a CSeq header, serializes the body (plain objects become
     * binary plist), applies outgoing transformation (e.g. encryption), and tracks
     * the pending response via a timeout-guarded promise.
     *
     * @param method - The RTSP/HTTP method verb.
     * @param path - The request target path.
     * @param options - Additional request configuration.
     * @returns The response from the remote device.
     * @throws TimeoutError if no response is received within the configured timeout.
     * @throws InvalidResponseError if the response has a non-OK status and `allowError` is not set.
     */
    protected async exchange(method: Method, path: string, options: ExchangeOptions = {}): Promise<Response> {
        const {
            contentType,
            headers: extraHeaders = {},
            allowError = false,
            protocol = 'RTSP/1.0',
            timeout = HTTP_TIMEOUT
        } = options;
        let {body} = options;

        const cseq = this.#cseq++;

        const headers: Record<string, string | number> = {
            'CSeq': cseq,
            ...this.getDefaultHeaders(),
            ...extraHeaders
        };

        let bodyBuffer: Buffer | undefined;

        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
            bodyBuffer = Buffer.from(Plist.serialize(body as {}));
            headers['Content-Type'] = 'application/x-apple-binary-plist';
        } else if (body) {
            bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body as Buffer;

            if (contentType) {
                headers['Content-Type'] = contentType;
            }
        } else if (contentType) {
            headers['Content-Type'] = contentType;
        }

        if (bodyBuffer) {
            headers['Content-Length'] = bodyBuffer.length;
        } else {
            headers['Content-Length'] = 0;
        }

        const headerLines = [
            `${method} ${path} ${protocol}`,
            ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
            '',
            ''
        ].join('\r\n');

        const raw = bodyBuffer
            ? Buffer.concat([Buffer.from(headerLines), bodyBuffer])
            : Buffer.from(headerLines);

        const data = this.transformOutgoing(Buffer.from(raw));

        this.context.logger.net('[rtsp]', method, path, `cseq=${cseq}`);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#requests.delete(cseq);
                reject(new TimeoutError(`No response to CSeq ${cseq} (${path})`));
            }, timeout);

            this.#requests.set(cseq, {
                resolve: (response) => {
                    clearTimeout(timer);

                    if (!allowError && !response.ok) {
                        reject(new InvalidResponseError(`RTSP error: ${response.status} ${response.statusText}`));
                    } else {
                        resolve(response);
                    }
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });

            try {
                this.write(data);
            } catch (err) {
                clearTimeout(timer);
                this.#requests.delete(cseq);
                reject(err);
            }
        });
    }

    /**
     * Handles TCP connection close events.
     *
     * Resets both internal buffers and rejects all pending requests with a
     * {@link ConnectionClosedError}.
     */
    onRtspClose(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);

        for (const [cseq, {reject}] of this.#requests) {
            reject(new ConnectionClosedError('Connection closed.'));
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', 'onRtspClose()');
    }

    /**
     * Handles incoming TCP data by accumulating, transforming, and parsing RTSP responses.
     *
     * Raw data is first appended to the encrypted buffer, then passed through
     * {@link transformIncoming} for decryption. The resulting plaintext is appended
     * to the parse buffer and consumed as complete RTSP responses. Each response is
     * matched to its pending request via the CSeq header.
     *
     * If the buffer exceeds {@link MAX_BUFFER_SIZE}, all buffers are reset and
     * pending requests are rejected to prevent memory exhaustion.
     *
     * @param data - Raw TCP data received from the socket.
     */
    onRtspData(data: Buffer): void {
        try {
            this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, data]);

            if (this.#encryptedBuffer.byteLength > MAX_BUFFER_SIZE) {
                this.context.logger.error('[rtsp]', `Buffer exceeded max size (${this.#encryptedBuffer.byteLength} bytes), resetting.`);
                this.#encryptedBuffer = Buffer.alloc(0);
                this.#buffer = Buffer.alloc(0);

                const err = new Error('Buffer overflow: exceeded maximum buffer size');

                for (const [cseq, {reject}] of this.#requests) {
                    reject(err);
                    this.#requests.delete(cseq);
                }

                this.emit('error', err);
                return;
            }

            const transformed = this.transformIncoming(this.#encryptedBuffer);

            if (transformed === false) {
                return;
            }

            this.#encryptedBuffer = Buffer.alloc(0);
            this.#buffer = Buffer.concat([this.#buffer, transformed]);

            while (this.#buffer.byteLength > 0) {
                const result = parseResponse(this.#buffer);

                if (result === null) {
                    return;
                }

                this.#buffer = this.#buffer.subarray(result.responseLength);

                const cseqHeader = result.response.headers.get('CSeq');
                const cseq = cseqHeader ? parseInt(cseqHeader, 10) : -1;

                if (this.#requests.has(cseq)) {
                    const {resolve} = this.#requests.get(cseq)!;
                    this.#requests.delete(cseq);
                    resolve(result.response);
                } else {
                    this.context.logger.warn('[rtsp]', `Unexpected response for CSeq ${cseq}`);
                }
            }
        } catch (err) {
            this.#encryptedBuffer = Buffer.alloc(0);
            this.#buffer = Buffer.alloc(0);
            this.context.logger.error('[rtsp]', 'onRtspData()', err);
            this.emit('error', err as Error);
        }
    }

    /**
     * Handles socket error events by rejecting all pending requests with the error.
     *
     * @param err - The error that occurred on the socket.
     */
    onRtspError(err: Error): void {
        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.error('[rtsp]', 'onRtspError()', err);
    }

    /**
     * Handles socket timeout events by rejecting all pending requests with a
     * {@link ConnectionTimeoutError}.
     */
    onRtspTimeout(): void {
        const err = new ConnectionTimeoutError();

        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', 'onRtspTimeout()');
    }
}
