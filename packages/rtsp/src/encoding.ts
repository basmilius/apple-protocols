/**
 * Supported RTSP/HTTP method verbs used in Apple protocol communication.
 */
export type Method =
    | 'ANNOUNCE'
    | 'FLUSH'
    | 'FLUSHBUFFERED'
    | 'GET'
    | 'GET_PARAMETER'
    | 'OPTIONS'
    | 'POST'
    | 'PUT'
    | 'RECORD'
    | 'SETUP'
    | 'SET_PARAMETER'
    | 'TEARDOWN';

/**
 * Parsed RTSP request containing method, path, headers, body, and total byte length.
 */
export type RtspRequest = {
    /** Parsed request headers with normalized (capitalized) names. */
    readonly headers: Record<string, string>;
    /** The RTSP/HTTP method verb. */
    readonly method: Method;
    /** The request target path (e.g. `/info`, `/pair-setup`). */
    readonly path: string;
    /** The request body as a raw buffer, empty if no body was present. */
    readonly body: Buffer;
    /** Total number of bytes consumed from the input buffer for this request (headers + body). */
    readonly requestLength: number;
};

/**
 * Parsed RTSP response wrapping a standard `Response` object alongside the total byte length consumed.
 */
export type RtspResponse = {
    /** The parsed response as a standard web `Response` object. */
    readonly response: Response;
    /** Total number of bytes consumed from the input buffer for this response (headers + body). */
    readonly responseLength: number;
};

/**
 * Options for building a serialized RTSP/HTTP response buffer.
 */
export type BuildResponseOptions = {
    /** HTTP status code (e.g. 200, 404). */
    readonly status: number;
    /** HTTP status reason phrase (e.g. "OK", "Not Found"). */
    readonly statusText: string;
    /** Additional response headers. Content-Length is set automatically. */
    readonly headers?: Record<string, string | number>;
    /** Optional response body. */
    readonly body?: Buffer;
    /** Protocol version line prefix. Defaults to `'RTSP/1.0'`. */
    readonly protocol?: 'RTSP/1.0' | 'HTTP/1.1';
};

/**
 * Builds a serialized RTSP/HTTP response buffer from the given options.
 *
 * Automatically sets the `Content-Length` header based on the body size.
 * The resulting buffer is ready to be sent over a TCP socket.
 *
 * @param options - Response configuration including status, headers, and body.
 * @returns A buffer containing the fully formatted response.
 */
export function buildResponse(options: BuildResponseOptions): Buffer {
    const {
        status,
        statusText,
        headers: extraHeaders = {},
        body,
        protocol = 'RTSP/1.0'
    } = options;

    const headers: Record<string, string | number> = {
        ...extraHeaders,
        'Content-Length': body?.byteLength ?? 0
    };

    const headerLines = [
        `${protocol} ${status} ${statusText}`,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        '',
        ''
    ].join('\r\n');

    if (body && body.byteLength > 0) {
        return Buffer.concat([Buffer.from(headerLines), body]);
    }

    return Buffer.from(headerLines);
}

/**
 * Attempts to parse an RTSP/HTTP request from the given buffer.
 *
 * Returns `null` if the buffer does not yet contain a complete request
 * (i.e. headers are incomplete or the body has not fully arrived).
 * This allows incremental parsing as TCP data arrives in chunks.
 *
 * @param buffer - The raw input buffer to parse from.
 * @returns The parsed request, or `null` if the buffer is incomplete.
 * @throws Error if the request line is malformed.
 */
export function parseRequest(buffer: Buffer): RtspRequest | null {
    const headerLength = buffer.indexOf('\r\n\r\n');

    if (headerLength === -1) {
        return null;
    }

    const {headers, method, path} = parseRequestHeaders(buffer.subarray(0, headerLength));

    let contentLength = headers['Content-Length'] ? Number(headers['Content-Length']) : 0;

    if (isNaN(contentLength)) {
        contentLength = 0;
    }

    const requestLength = headerLength + 4 + contentLength;

    if (buffer.byteLength < requestLength) {
        return null;
    }

    const body = buffer.subarray(headerLength + 4, requestLength);

    return {
        headers,
        method,
        path,
        body,
        requestLength
    };
}

/**
 * Attempts to parse an RTSP/HTTP response from the given buffer.
 *
 * Returns `null` if the buffer does not yet contain a complete response
 * (i.e. headers are incomplete or the body has not fully arrived).
 * This allows incremental parsing as TCP data arrives in chunks.
 *
 * @param buffer - The raw input buffer to parse from.
 * @returns The parsed response wrapped in an {@link RtspResponse}, or `null` if the buffer is incomplete.
 * @throws Error if the status line is malformed.
 */
export function parseResponse(buffer: Buffer): RtspResponse | null {
    const headerLength = buffer.indexOf('\r\n\r\n');

    if (headerLength === -1) {
        return null;
    }

    const {headers, status, statusText} = parseResponseHeaders(buffer.subarray(0, headerLength));

    let contentLength = headers['Content-Length'] ? Number(headers['Content-Length']) : 0;

    if (isNaN(contentLength)) {
        contentLength = 0;
    }

    const responseLength = headerLength + 4 + contentLength;

    if (buffer.byteLength < responseLength) {
        return null;
    }

    const body = buffer.subarray(headerLength + 4, responseLength);
    const response = new Response(body as unknown as ReadableStream, {
        status,
        statusText,
        headers
    });

    return {
        response,
        responseLength
    };
}

/**
 * Parses raw header lines into a key-value record.
 *
 * Header names are normalized to capitalized form (e.g. `content-length` becomes
 * `Content-Length`) so that lookups work regardless of the sender's casing.
 * Lines without a valid colon separator are silently skipped.
 *
 * @param lines - Individual header lines (without the request/status line).
 * @returns A record mapping normalized header names to their values.
 */
function parseHeaders(lines: string[]): Record<string, string> {
    const headers: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');

        if (colon <= 0) {
            continue;
        }

        // Normalize to capitalized form (e.g. 'content-length' → 'Content-Length')
        // so lookups like headers['CSeq'] work regardless of sender casing.
        const rawName = lines[i].substring(0, colon).trim();
        const name = rawName.replace(/(^|-)(\w)/g, (_, prefix, char) => prefix + char.toUpperCase());
        headers[name] = lines[i].substring(colon + 1).trim();
    }

    return headers;
}

/**
 * Parses the header section of an RTSP/HTTP request buffer into structured components.
 *
 * Extracts the method, path, and headers from the raw header bytes. The first line
 * is expected to match the format `METHOD /path RTSP/1.0` or `METHOD /path HTTP/1.1`.
 *
 * @param buffer - The raw header bytes (up to but not including the `\r\n\r\n` delimiter).
 * @returns An object containing the parsed headers, method, and path.
 * @throws Error if the request line does not match the expected format.
 */
function parseRequestHeaders(buffer: Buffer): { headers: Record<string, string>; method: Method; path: string } {
    const lines = buffer.toString('utf8').split('\r\n');

    const rawRequest = lines[0].match(/^(\S+)\s+(\S+)\s+(?:RTSP|HTTP)\/[\d.]+$/);

    if (!rawRequest) {
        throw new Error(`Invalid RTSP/HTTP request line: ${lines[0]}`);
    }

    const method = rawRequest[1] as Method;
    const path = rawRequest[2];
    const headers = parseHeaders(lines.slice(1));

    return {headers, method, path};
}

/**
 * Parses the header section of an RTSP/HTTP response buffer into structured components.
 *
 * Extracts the status code, status text, and headers from the raw header bytes. The first
 * line is expected to match the format `RTSP/1.0 200 OK` or `HTTP/1.1 200 OK`.
 *
 * @param buffer - The raw header bytes (up to but not including the `\r\n\r\n` delimiter).
 * @returns An object containing the parsed headers, status code, and status text.
 * @throws Error if the status line does not match the expected format.
 */
function parseResponseHeaders(buffer: Buffer): { headers: Record<string, string>; status: number; statusText: string } {
    const lines = buffer.toString('utf8').split('\r\n');

    const rawStatus = lines[0].match(/(HTTP|RTSP)\/[\d.]+\s+(\d+)\s+(.+)/);

    if (!rawStatus) {
        throw new Error(`Invalid RTSP/HTTP response line: ${lines[0]}`);
    }

    const status = Number(rawStatus[2]);
    const statusText = rawStatus[3];
    const headers = parseHeaders(lines.slice(1));

    return {headers, status, statusText};
}
