import type { RTSPMethod } from '@/protocol/types';

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

export function makeHttpResponse(buffer: Buffer): HttpResponse | null {
    const headerLength = buffer.indexOf('\r\n\r\n');
    const {status, statusText, headers} = parseHeaders(buffer.subarray(0, headerLength));

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

function parseHeaders(buffer: Buffer): HttpHeader {
    const headers: Record<string, string> = {};
    const lines = buffer.toString('utf8').split('\r\n');

    const rawStatus = lines[0].match(/(HTTP|RTSP)\/[\d.]+\s+(\d+)\s+(.+)/);
    const status = Number(rawStatus[2]);
    const statusText = rawStatus[3];

    for (let i = 1; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');

        if (colon <= 0) {
            continue;
        }

        const name = lines[i].substring(0, colon).trim();
        headers[name] = lines[i].substring(colon + 1).trim();
    }

    return {
        status,
        statusText,
        headers
    };
}

type HttpHeader = {
    readonly status: number;
    readonly statusText: string;
    readonly headers: Record<string, string>;
};

type HttpResponse = {
    readonly response: Response;
    readonly responseLength: number;
};
