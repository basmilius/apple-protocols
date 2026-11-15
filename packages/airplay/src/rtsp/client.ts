import { ConnectionClosedError, ConnectionTimeoutError, InvalidResponseError, reporter, TimeoutError } from '@corewire/core';
import { Plist } from '@corewire/core/encoding';
import { type CloseReason, Connection, type Context } from '@corewire/core/transport';
import { HTTP_TIMEOUT } from '../const';
import { type Method, parseResponse } from './encoding';

/** A request waiting for its response, keyed by CSeq. */
type PendingRequest = {
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
};

export type ExchangeOptions = {
    /** Content-Type header; `application/x-apple-binary-plist` for a plain object body. */
    contentType?: string;

    /** Extra headers, merged after the default headers. */
    headers?: Record<string, string>;

    /** A plain object goes as binary plist; strings and buffers go as they are. */
    body?: Buffer | string | Record<string, unknown>;

    /** Resolves a non-OK response instead of rejecting with {@link InvalidResponseError}. */
    allowError?: boolean;

    /** Protocol of the request line, `'RTSP/1.0'` by default. */
    protocol?: 'RTSP/1.0' | 'HTTP/1.1';

    /** Response timeout in milliseconds, `HTTP_TIMEOUT` by default. */
    timeout?: number;
};

/** Buffer size at which the buffers reset, against memory exhaustion. */
const MAX_BUFFER_SIZE = 2 * 1024 * 1024;

/**
 * RTSP over TCP with CSeq-based response tracking and binary-plist serialization of object bodies.
 * Keeps ciphertext and plaintext separate to handle partial TCP delivery.
 * Override {@link transformIncoming}, {@link transformOutgoing} and {@link getDefaultHeaders} for encryption and protocol headers.
 */
export class RtspClient extends Connection<{}> {
    /** Decrypted plaintext waiting to be parsed as responses. */
    #buffer: Buffer = Buffer.alloc(0);

    /** Raw TCP data waiting for {@link transformIncoming}. */
    #encryptedBuffer: Buffer = Buffer.alloc(0);

    #cseq: number = 0;
    #requests: Map<number, PendingRequest> = new Map();

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        // A connection lives once, so these listeners never need removing.
        this.on('closed', (reason, error) => this.#onClose(reason, error));
        this.on('data', (data: Buffer) => this.#onData(data));
        this.on('error', (error: Error) => this.#onError(error));
    }

    /**
     * Headers on every request, after CSeq and before the headers of
     * {@link ExchangeOptions.headers}. A subclass adds its session headers
     * here, such as DACP-ID and Active-Remote.
     */
    protected getDefaultHeaders(): Record<string, string | number> {
        return {};
    }

    /**
     * Decrypts incoming TCP data before parsing; a subclass overrides it.
     *
     * @returns The plaintext, with the consumed byte count when not all input
     *          was used, or `false` until a complete encrypted block arrived.
     */
    protected transformIncoming(data: Buffer): Buffer | false | {data: Buffer; consumed: number} {
        return data;
    }

    /** Encrypts a formatted request before it goes to the socket; a subclass overrides it. */
    protected transformOutgoing(data: Buffer): Buffer {
        return data;
    }

    /**
     * Sends a request with CSeq tracking and a response timeout. Object bodies become binary plists.
     *
     * @throws TimeoutError if no response arrives in time.
     * @throws InvalidResponseError for non-OK status unless `allowError` is set.
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
            ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
            '',
            ''
        ].join('\r\n');

        const raw = bodyBuffer
            ? Buffer.concat([Buffer.from(headerLines), bodyBuffer])
            : Buffer.from(headerLines);

        const data = this.transformOutgoing(Buffer.from(raw));

        this.context.logger.net('[rtsp]', method, path, `cseq=${cseq}`);

        if (reporter.tapsTraffic) {
            this.context.logger.traffic('rtsp', 'out', `${method} ${path} cseq=${cseq}`, {headers, body: decodeBody(String(headers['Content-Type'] ?? ''), bodyBuffer)}, raw);
        }

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
     * Resets both buffers and rejects every pending request: with a {@link ConnectionTimeoutError}
     * after a timeout, with the error that broke the connection, or with a {@link ConnectionClosedError}.
     */
    #onClose(reason: CloseReason, error?: Error): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);

        for (const [cseq, {reject}] of this.#requests) {
            reject(reason === 'timeout' ? new ConnectionTimeoutError() : error ?? new ConnectionClosedError('Connection closed.'));
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', 'onRtspClose()', reason);
    }

    /**
     * Collects TCP data in the encrypted buffer, decrypts it with
     * {@link transformIncoming} into the plaintext buffer and matches each
     * complete response to its request by CSeq. Past {@link MAX_BUFFER_SIZE},
     * both buffers reset and every pending request is rejected.
     */
    #onData(data: Buffer): void {
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

            const result = Buffer.isBuffer(transformed) ? {data: transformed, consumed: this.#encryptedBuffer.length} : transformed;

            this.#encryptedBuffer = Buffer.from(this.#encryptedBuffer.subarray(result.consumed));
            this.#buffer = Buffer.concat([this.#buffer, result.data]);

            while (this.#buffer.byteLength > 0) {
                const result = parseResponse(this.#buffer);

                if (result === null) {
                    return;
                }

                if (reporter.tapsTraffic) {
                    this.#tapResponse(result.response, this.#buffer.subarray(0, result.responseLength));
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
            this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
    }

    /**
     * Reports a response to the traffic sink. The body is cut from the frame, because reading it
     * off the `Response` would consume it before the caller gets to.
     *
     * @param bytes - The plaintext response as it was framed.
     */
    #tapResponse(response: Response, bytes: Buffer): void {
        const frame = Buffer.from(bytes);
        const headers = Object.fromEntries(response.headers.entries());
        const bodyStart = frame.indexOf('\r\n\r\n') + 4;
        const body = decodeBody(headers['content-type'] ?? '', frame.subarray(bodyStart));

        this.context.logger.traffic('rtsp', 'in', `${response.status} ${response.statusText} cseq=${headers['cseq'] ?? '?'}`, {headers, body}, frame);
    }

    /** Rejects every pending request with the socket error. */
    #onError(err: Error): void {
        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.error('[rtsp]', 'onRtspError()', err);
    }
}

/**
 * Turns a body into something readable for the traffic sink: a parsed plist, text, or nothing
 * when it is binary the sink already gets as bytes.
 */
function decodeBody(contentType: string, body: Buffer | undefined): unknown {
    if (!body || body.byteLength === 0) {
        return undefined;
    }

    try {
        if (contentType.includes('plist')) {
            return decodeNestedPlist(Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as any));
        }

        if (contentType.startsWith('text/') || contentType.includes('sdp') || contentType.includes('parameters')) {
            return body.toString('utf8');
        }
    } catch {
        // An undecodable body is still in the entry as bytes.
    }

    return undefined;
}

/** Decodes a binary plist in `params.data`, as AirPlay play queue commands carry one. */
function decodeNestedPlist(value: unknown): unknown {
    const params = (value as {params?: unknown} | null)?.params as {data?: unknown} | undefined;
    const data = params?.data;

    if (!(data instanceof ArrayBuffer) || data.byteLength < 8 || Buffer.from(data, 0, 8).toString('latin1') !== 'bplist00') {
        return value;
    }

    try {
        return {...(value as object), params: {...params, data: Plist.parse(data)}};
    } catch {
        return value;
    }
}
