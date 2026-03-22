export type Method =
    | 'ANNOUNCE'
    | 'FLUSH'
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
    readonly headers: Record<string, string>;
    readonly method: Method;
    readonly path: string;
    readonly body: Buffer;
    readonly requestLength: number;
};

export type RtspResponse = {
    readonly response: Response;
    readonly responseLength: number;
};

export type BuildResponseOptions = {
    readonly status: number;
    readonly statusText: string;
    readonly headers?: Record<string, string | number>;
    readonly body?: Buffer;
    readonly protocol?: 'RTSP/1.0' | 'HTTP/1.1';
};

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

function parseHeaders(lines: string[]): Record<string, string> {
    const headers: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');

        if (colon <= 0) {
            continue;
        }

        const name = lines[i].substring(0, colon).trim();
        headers[name] = lines[i].substring(colon + 1).trim();
    }

    return headers;
}

function parseRequestHeaders(buffer: Buffer): { headers: Record<string, string>; method: Method; path: string } {
    const lines = buffer.toString('utf8').split('\r\n');

    const rawRequest = lines[0].match(/^(\S+)\s+(\S+)\s+RTSP\/1\.0$/);

    if (!rawRequest) {
        throw new Error(`Invalid RTSP request line: ${lines[0]}`);
    }

    const method = rawRequest[1] as Method;
    const path = rawRequest[2];
    const headers = parseHeaders(lines.slice(1));

    return {headers, method, path};
}

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
