import { createHash } from 'node:crypto';
import { generateActiveRemoteId, generateDacpId, generateSessionId } from '@basmilius/apple-airplay';
import { Connection, type Context, HTTP_TIMEOUT } from '@basmilius/apple-common';
import { DAAP, Plist, RTSP } from '@basmilius/apple-encoding';
import type { MediaMetadata } from './types';

const USER_AGENT = 'AirPlay/550.10';
const FRAMES_PER_PACKET = 352;

// Used to signal that traffic is to be unencrypted
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

// Static Curve25519 public key for auth-setup (from owntone-server)
const CURVE25519_PUB_KEY = Buffer.from([
    0x59, 0x02, 0xed, 0xe9, 0x0d, 0x4e, 0xf2, 0xbd,
    0x4c, 0xb6, 0x8a, 0x63, 0x30, 0x03, 0x82, 0x07,
    0xa9, 0x4d, 0xbd, 0x50, 0xd8, 0xaa, 0x46, 0x5b,
    0x5d, 0x8c, 0x01, 0x2a, 0x0c, 0x7e, 0x1d, 0x4e
]);

type AnnouncePayloadOptions = {
    readonly sessionId: number;
    readonly localIp: string;
    readonly remoteIp: string;
    readonly bitsPerChannel: number;
    readonly channels: number;
    readonly sampleRate: number;
};

type DigestInfo = {
    readonly username: string;
    readonly realm: string;
    readonly password: string;
    readonly nonce: string;
}

function getDigestPayload(method: string, uri: string, info: DigestInfo): string {
    const ha1 = createHash('md5')
        .update(`${info.username}:${info.realm}:${info.password}`)
        .digest('hex');

    const ha2 = createHash('md5')
        .update(`${method}:${uri}`)
        .digest('hex');

    const response = createHash('md5')
        .update(`${ha1}:${info.nonce}:${ha2}`)
        .digest('hex');

    return `Digest username="${info.username}", realm="${info.realm}", nonce="${info.nonce}", uri="${uri}", response="${response}"`;
}

function generateRandomSessionId(): number {
    return Math.floor(Math.random() * 0xFFFFFFFF);
}

function buildAnnouncePayload(options: AnnouncePayloadOptions): string {
    return [
        'v=0',
        `o=iTunes ${options.sessionId} 0 IN IP4 ${options.localIp}`,
        's=iTunes',
        `c=IN IP4 ${options.remoteIp}`,
        't=0 0',
        'm=audio 0 RTP/AVP 96',
        `a=rtpmap:96 L16/${options.sampleRate}/${options.channels}`,
        `a=fmtp:96 ${FRAMES_PER_PACKET} 0 ${options.bitsPerChannel} 40 10 14 ${options.channels} 255 0 0 ${options.sampleRate}`
    ].join('\r\n') + '\r\n';
}

export default class RtspClient extends Connection<{}> {
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    get dacpId(): string {
        return this.#dacpId;
    }

    get rtspSessionId(): string {
        return this.#rtspSessionId;
    }

    get sessionId(): number {
        return this.#sessionId;
    }

    get uri(): string {
        return `rtsp://${this.connection.localIp}/${this.#sessionId}`;
    }

    get connection(): { localIp: string; remoteIp: string } {
        return {
            localIp: this.#localIp,
            remoteIp: this.address
        };
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #rtspSessionId: string;
    readonly #sessionId: number;
    #localIp: string = '0.0.0.0';
    #buffer: Buffer = Buffer.alloc(0);
    #cseq: number = 0;
    #digestInfo?: DigestInfo;
    #requests: Map<number, {
        resolve: (response: Response) => void;
        reject: (error: Error) => void;
    }> = new Map();

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#rtspSessionId = generateSessionId();
        this.#sessionId = generateRandomSessionId();

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));
        this.on('timeout', this.#onTimeout.bind(this));
        this.on('connect', this.#onConnect.bind(this));
    }

    async info(): Promise<Record<string, unknown>> {
        try {
            const response = await this.#exchange('GET', '/info', {
                allowError: true
            });

            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                if (buffer.length > 0) {
                    try {
                        return Plist.parse(buffer.buffer) as Record<string, unknown>;
                    } catch {
                        return {};
                    }
                }
            }

            return {};
        } catch {
            return {};
        }
    }

    async authSetup(): Promise<void> {
        const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);

        await this.#exchange('POST', '/auth-setup', {
            contentType: 'application/octet-stream',
            body,
            protocol: 'HTTP/1.1'
        });
    }

    async announce(bytesPerChannel: number, channels: number, sampleRate: number, password?: string): Promise<Response> {
        const body = buildAnnouncePayload({
            sessionId: this.#sessionId,
            localIp: this.connection.localIp,
            remoteIp: this.connection.remoteIp,
            bitsPerChannel: 8 * bytesPerChannel,
            channels,
            sampleRate
        });

        let response = await this.#exchange('ANNOUNCE', undefined, {
            contentType: 'application/sdp',
            body,
            allowError: !!password
        });

        // Handle password authentication
        if (response.status === 401 && password) {
            const wwwAuthenticate = response.headers.get('www-authenticate');

            if (wwwAuthenticate) {
                const parts = wwwAuthenticate.split('"');

                if (parts.length >= 5) {
                    this.#digestInfo = {
                        username: 'pyatv',
                        realm: parts[1],
                        password,
                        nonce: parts[3]
                    };

                    response = await this.#exchange('ANNOUNCE', undefined, {
                        contentType: 'application/sdp',
                        body
                    });
                }
            }
        }

        return response;
    }

    async setup(headers?: Record<string, string>, body?: Buffer | string | Record<string, unknown>): Promise<Response> {
        return await this.#exchange('SETUP', undefined, {headers, body});
    }

    async record(headers?: Record<string, string>): Promise<void> {
        await this.#exchange('RECORD', undefined, {headers});
    }

    async flush(options: { headers: Record<string, string> }): Promise<void> {
        await this.#exchange('FLUSH', undefined, {headers: options.headers});
    }

    async setParameter(name: string, value: string): Promise<void> {
        await this.#exchange('SET_PARAMETER', undefined, {
            contentType: 'text/parameters',
            body: `${name}: ${value}`
        });
    }

    async setMetadata(session: string, rtpseq: number, rtptime: number, metadata: MediaMetadata): Promise<void> {
        const daapData = DAAP.encodeTrackMetadata({
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            duration: metadata.duration
        });

        await this.#exchange('SET_PARAMETER', undefined, {
            contentType: 'application/x-dmap-tagged',
            headers: {
                'Session': session,
                'RTP-Info': `seq=${rtpseq};rtptime=${rtptime}`
            },
            body: daapData
        });
    }

    async setArtwork(session: string, rtpseq: number, rtptime: number, artwork: Buffer): Promise<void> {
        let contentType = 'image/jpeg';
        if (artwork[0] === 0x89 && artwork[1] === 0x50) {
            contentType = 'image/png';
        }

        await this.#exchange('SET_PARAMETER', undefined, {
            contentType,
            headers: {
                'Session': session,
                'RTP-Info': `seq=${rtpseq};rtptime=${rtptime}`
            },
            body: artwork
        });
    }

    async feedback(allowError: boolean = false): Promise<Response> {
        return await this.#exchange('POST', '/feedback', {allowError});
    }

    async teardown(session: string): Promise<void> {
        await this.#exchange('TEARDOWN', undefined, {
            headers: {'Session': session}
        });
    }

    async #exchange(
        method: RTSP.Method,
        uri?: string,
        options: {
            contentType?: string;
            headers?: Record<string, string>;
            body?: Buffer | string | Record<string, unknown>;
            allowError?: boolean;
            protocol?: 'RTSP/1.0' | 'HTTP/1.1';
            timeout?: number;
        } = {}
    ): Promise<Response> {
        const {
            contentType,
            headers: extraHeaders = {},
            allowError = false,
            protocol = 'RTSP/1.0',
            timeout = HTTP_TIMEOUT
        } = options;
        let {body} = options;

        const cseq = this.#cseq++;
        const targetUri = uri ?? this.uri;

        const headers: Record<string, string | number> = {
            'CSeq': cseq,
            'DACP-ID': this.#dacpId,
            'Active-Remote': this.#activeRemoteId,
            'Client-Instance': this.#dacpId,
            'User-Agent': USER_AGENT
        };

        if (this.#digestInfo) {
            headers['Authorization'] = getDigestPayload(method, targetUri, this.#digestInfo);
        }

        Object.assign(headers, extraHeaders);

        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
            headers['Content-Type'] = 'application/x-apple-binary-plist';
            body = Buffer.from(Plist.serialize(body as {}));
        } else if (contentType) {
            headers['Content-Type'] = contentType;
        }

        let bodyBuffer: Buffer | undefined;
        if (body) {
            bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body as Buffer;
            headers['Content-Length'] = bodyBuffer.length;
        } else {
            headers['Content-Length'] = 0;
        }

        const headerLines = [
            `${method} ${targetUri} ${protocol}`,
            ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
            '',
            ''
        ].join('\r\n');

        const data = bodyBuffer
            ? Buffer.concat([Buffer.from(headerLines), bodyBuffer])
            : Buffer.from(headerLines);

        this.context.logger.net('[rtsp]', method, targetUri, `cseq=${cseq}`);

        return new Promise((resolve, reject) => {
            this.#requests.set(cseq, {resolve, reject});

            const timer = setTimeout(() => {
                this.#requests.delete(cseq);
                reject(new Error(`No response to CSeq ${cseq} (${targetUri})`));
            }, timeout);

            this.write(data).catch(err => {
                clearTimeout(timer);
                this.#requests.delete(cseq);
                reject(err);
            });

            const originalResolve = resolve;

            this.#requests.set(cseq, {
                resolve: (response) => {
                    clearTimeout(timer);
                    if (!allowError && !response.ok) {
                        reject(new Error(`RTSP error: ${response.status} ${response.statusText}`));
                    } else {
                        originalResolve(response);
                    }
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });
        });
    }

    #onConnect(): void {
        this.#localIp = '0.0.0.0';
    }

    #onClose(): void {
        this.#buffer = Buffer.alloc(0);

        for (const [cseq, {reject}] of this.#requests) {
            reject(new Error('Connection closed'));
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', '#onClose()');
    }

    #onData(data: Buffer): void {
        try {
            this.#buffer = Buffer.concat([this.#buffer, data]);

            while (this.#buffer.byteLength > 0) {
                const result = RTSP.makeResponse(this.#buffer);

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
            this.context.logger.error('[rtsp]', '#onData()', err);
            this.emit('error', err as Error);
        }
    }

    #onError(err: Error): void {
        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.error('[rtsp]', '#onError()', err);
    }

    #onTimeout(): void {
        const err = new Error('Connection timed out');

        for (const [cseq, {reject}] of this.#requests) {
            reject(err);
            this.#requests.delete(cseq);
        }

        this.context.logger.net('[rtsp]', '#onTimeout()');
    }
}
