import { createHash } from 'node:crypto';
import { type Context, generateActiveRemoteId, generateDacpId, generateSessionId } from '@basmilius/apple-common';
import { DAAP, Plist } from '@basmilius/apple-encoding';
import { RtspClient } from '@basmilius/apple-rtsp';
import type { MediaMetadata } from './types';

const USER_AGENT = 'AirPlay/550.10';
const FRAMES_PER_PACKET = 352;

const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

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
};

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

export default class RaopRtspClient extends RtspClient {
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
    #digestInfo?: DigestInfo;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#rtspSessionId = generateSessionId();
        this.#sessionId = Math.floor(Math.random() * 0xFFFFFFFF);

        this.on('connect', () => {
            this.#localIp = '0.0.0.0';
        });
    }

    protected override getDefaultHeaders(): Record<string, string | number> {
        const headers: Record<string, string | number> = {
            'DACP-ID': this.#dacpId,
            'Active-Remote': this.#activeRemoteId,
            'Client-Instance': this.#dacpId,
            'User-Agent': USER_AGENT
        };

        if (this.#digestInfo) {
            headers['Authorization'] = getDigestPayload('', this.uri, this.#digestInfo);
        }

        return headers;
    }

    async info(): Promise<Record<string, unknown>> {
        try {
            const response = await this.exchange('GET', '/info', {
                allowError: true
            });

            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());

                if (buffer.length > 0) {
                    try {
                        return Plist.parse(buffer.buffer) as Record<string, unknown>;
                    } catch (err) {
                        this.context.logger.warn('[raop-rtsp]', 'Failed to parse info plist', err);
                        return {};
                    }
                }
            }

            return {};
        } catch (err) {
            this.context.logger.warn('[raop-rtsp]', 'Failed to get device info', err);
            return {};
        }
    }

    async authSetup(): Promise<void> {
        const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);

        await this.exchange('POST', '/auth-setup', {
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

        let response = await this.exchange('ANNOUNCE', this.uri, {
            contentType: 'application/sdp',
            body,
            allowError: !!password
        });

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

                    response = await this.exchange('ANNOUNCE', this.uri, {
                        contentType: 'application/sdp',
                        body
                    });
                }
            }
        }

        return response;
    }

    async setup(headers?: Record<string, string>, body?: Buffer | string | Record<string, unknown>): Promise<Response> {
        return await this.exchange('SETUP', this.uri, {headers, body});
    }

    async record(headers?: Record<string, string>): Promise<void> {
        await this.exchange('RECORD', this.uri, {headers});
    }

    async flush(options: { headers: Record<string, string> }): Promise<void> {
        await this.exchange('FLUSH', this.uri, {headers: options.headers});
    }

    async setParameter(name: string, value: string): Promise<void> {
        await this.exchange('SET_PARAMETER', this.uri, {
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

        await this.exchange('SET_PARAMETER', this.uri, {
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

        await this.exchange('SET_PARAMETER', this.uri, {
            contentType,
            headers: {
                'Session': session,
                'RTP-Info': `seq=${rtpseq};rtptime=${rtptime}`
            },
            body: artwork
        });
    }

    async feedback(allowError: boolean = false): Promise<Response> {
        return await this.exchange('POST', '/feedback', {allowError});
    }

    async teardown(session: string): Promise<void> {
        await this.exchange('TEARDOWN', this.uri, {
            headers: {'Session': session}
        });
    }
}
