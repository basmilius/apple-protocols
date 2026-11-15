const MAX_HEADER_LENGTH = 64 * 1024;
const MAX_BODY_LENGTH = 16 * 1024 * 1024;

/** The RTSP and HTTP methods of the Apple protocols. */
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

export type RtspRequest = {
    /** Headers with capitalized names. */
    readonly headers: Record<string, string>;

    readonly method: Method;

    /** Request target, for example `/info` or `/pair-setup`. */
    readonly path: string;

    /** Empty when the request has no body. */
    readonly body: Buffer;

    /** Bytes the request took from the input buffer, headers and body. */
    readonly requestLength: number;
};

export type RtspResponse = {
    readonly response: Response;

    /** Bytes the response took from the input buffer, headers and body. */
    readonly responseLength: number;
};

export type BuildResponseOptions = {
    readonly status: number;
    readonly statusText: string;

    /** Extra headers; Content-Length is set from the body. */
    readonly headers?: Record<string, string | number>;

    readonly body?: Buffer;

    /** Protocol of the status line, `'RTSP/1.0'` by default. */
    readonly protocol?: 'RTSP/1.0' | 'HTTP/1.1';
};

/** Serializes an RTSP or HTTP response, with `Content-Length` set from the body. */
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
 * Parses an RTSP or HTTP request from the start of a buffer that fills as
 * TCP data arrives.
 *
 * @returns The request, or `null` while the headers or body are incomplete.
 * @throws Error if the request line is malformed.
 */
export function parseRequest(buffer: Buffer): RtspRequest | null {
    const headerLength = buffer.indexOf('\r\n\r\n');

    if (headerLength > MAX_HEADER_LENGTH || (headerLength === -1 && buffer.length > MAX_HEADER_LENGTH)) {
        throw new Error('RTSP headers exceed maximum length');
    }

    if (headerLength === -1) {
        return null;
    }

    const {headers, method, path} = parseRequestHeaders(buffer.subarray(0, headerLength));

    const contentLength = parseContentLength(headers);

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
 * Parses an RTSP or HTTP response from the start of a buffer that fills as
 * TCP data arrives.
 *
 * @returns The response, or `null` while the headers or body are incomplete.
 * @throws Error if the status line is malformed.
 */
export function parseResponse(buffer: Buffer): RtspResponse | null {
    const headerLength = buffer.indexOf('\r\n\r\n');

    if (headerLength > MAX_HEADER_LENGTH || (headerLength === -1 && buffer.length > MAX_HEADER_LENGTH)) {
        throw new Error('RTSP headers exceed maximum length');
    }

    if (headerLength === -1) {
        return null;
    }

    const {headers, status, statusText} = parseResponseHeaders(buffer.subarray(0, headerLength));

    const contentLength = parseContentLength(headers);

    const responseLength = headerLength + 4 + contentLength;

    if (buffer.byteLength < responseLength) {
        return null;
    }

    const body = buffer.subarray(headerLength + 4, responseLength);
    const response = new Response(status === 204 || status === 205 || status === 304 ? null : new Uint8Array(body), {
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
 * Parses header lines, without the request or status line. Names become
 * capitalized (`content-length` to `Content-Length`), so lookups ignore the
 * sender's casing. Lines without a colon are skipped.
 */
function parseHeaders(lines: string[]): Record<string, string> {
    const headers: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');

        if (colon <= 0) {
            continue;
        }

        const rawName = lines[i].substring(0, colon).trim();

        const name = rawName.toLowerCase() === 'cseq'
            ? 'CSeq'
            : rawName.toLowerCase().replace(/(^|-)(\w)/g, (_, prefix, char) => prefix + char.toUpperCase());

        const value = lines[i].substring(colon + 1).trim();

        if (name === 'Content-Length' && headers[name] !== undefined && headers[name] !== value) {
            throw new Error('Conflicting Content-Length headers');
        }

        headers[name] = value;
    }

    return headers;
}

/**
 * Parses the header section of a request, with a first line such as
 * `METHOD /path RTSP/1.0` or `METHOD /path HTTP/1.1`.
 *
 * @param buffer - The header bytes, without the `\r\n\r\n` delimiter.
 * @throws Error if the request line does not match.
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
 * Parses the header section of a response, with a first line such as
 * `RTSP/1.0 200 OK` or `HTTP/1.1 200 OK`.
 *
 * @param buffer - The header bytes, without the `\r\n\r\n` delimiter.
 * @throws Error if the status line does not match.
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

function parseContentLength(headers: Record<string, string>): number {
    const value = headers['Content-Length'];

    if (value === undefined) {
        return 0;
    }

    const length = Number(value);

    if (!/^\d+$/.test(value) || !Number.isSafeInteger(length) || length > MAX_BODY_LENGTH) {
        throw new Error('Invalid or excessive Content-Length');
    }

    return length;
}
