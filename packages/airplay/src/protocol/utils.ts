import { randomBytes } from 'node:crypto';
import { debug } from '@basmilius/apple-common';
import type { RTSPMethod } from './types';

export function makeHttpHeader(method: RTSPMethod, path: string, headers: HeadersInit, cseq: number): string {
    const lines = [];
    lines.push(`${method} ${path} RTSP/1.0`);
    lines.push(`CSeq: ${cseq}`);
    lines.push('User-Agent: AirPlay/320.20');
    lines.push('X-ProtocolVersion: 1');

    for (const [name, value] of Object.entries(headers)) {
        lines.push(`${name}: ${value}`);
    }

    lines.push('');
    lines.push('');

    return lines.join('\r\n');
}

export function makeHttpRequest(buffer: Buffer): HttpRequest | null {
    const headerLength = buffer.indexOf('\r\n\r\n');
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

export function makeHttpResponse(buffer: Buffer): HttpResponse | null {
    const headerLength = buffer.indexOf('\r\n\r\n');
    const {headers, status, statusText} = parseResponseHeaders(buffer.subarray(0, headerLength));

    let contentLength = headers['Content-Length'] ? Number(headers['Content-Length']) : 0;

    if (isNaN(contentLength)) {
        contentLength = 0;
    }

    const responseLength = headerLength + 4 + contentLength;

    // not enough data yet
    if (buffer.byteLength < responseLength) {
        return null;
    }

    const body = buffer.subarray(headerLength + 4, responseLength);
    const response = new Response(body, {
        status,
        statusText,
        headers
    });

    return {
        response,
        responseLength
    };
}

export function randomInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

export function randomInt64(): bigint {
    return randomBytes(8).readBigUint64LE(0);
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

function parseRequestHeaders(buffer: Buffer): HttpRequestHeader {
    const lines = buffer.toString('utf8').split('\r\n');

    const rawRequest = lines[0].match(/^(\S+)\s+(\S+)\s+RTSP\/1\.0$/);
    const method = rawRequest[1] as RTSPMethod;
    const path = rawRequest[2];
    const headers: Record<string, string> = parseHeaders(lines.slice(1));

    return {
        headers,
        method,
        path
    };
}

function parseResponseHeaders(buffer: Buffer): HttpResponseHeader {
    const lines = buffer.toString('utf8').split('\r\n');

    const rawStatus = lines[0].match(/(HTTP|RTSP)\/[\d.]+\s+(\d+)\s+(.+)/);
    const status = Number(rawStatus[2]);
    const statusText = rawStatus[3];
    const headers: Record<string, string> = parseHeaders(lines.slice(1));

    return {
        headers,
        status,
        statusText
    };
}

type HttpRequestHeader = {
    readonly headers: Record<string, string>;
    readonly method: RTSPMethod;
    readonly path: string;
};

type HttpResponseHeader = {
    readonly headers: Record<string, string>;
    readonly status: number;
    readonly statusText: string;
};

type HttpRequest = {
    readonly headers: Record<string, string>;
    readonly method: RTSPMethod;
    readonly path: string;
    readonly body: Buffer;
    readonly requestLength: number;
};

type HttpResponse = {
    readonly response: Response;
    readonly responseLength: number;
};
