import { createHash } from 'node:crypto';
import { DAAP, Plist } from '@apple-protocols/core/encoding';
import type { Context } from '@apple-protocols/core/transport';
import { AUDIO_FRAMES_PER_PACKET } from '../const';
import { generateActiveRemoteId, generateDacpId, generateSessionId } from '../identifiers';
import { RtspClient } from '../rtsp';
import type { MediaMetadata } from './types';

const USER_AGENT = 'AirPlay/550.10';

/** Flag byte for unencrypted auth-setup mode. */
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

/** Static Curve25519 public key for the MFi-SAP `/auth-setup` of an AirPort Express. */
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

    /** Sample rate in Hz. */
    readonly sampleRate: number;
};

/** HTTP Digest credentials for the challenge of a 401 WWW-Authenticate response. */
type DigestInfo = {
    readonly username: string;
    readonly realm: string;
    readonly password: string;
    readonly nonce: string;
};

/**
 * Computes an MD5 HTTP Digest authorization header value.
 *
 * @param method - RTSP method; empty for the default headers.
 */
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

/** Builds the SDP body of the RTSP ANNOUNCE request, with CRLF line endings. */
function buildAnnouncePayload(options: AnnouncePayloadOptions): string {
    return [
        'v=0',
        `o=iTunes ${options.sessionId} 0 IN IP4 ${options.localIp}`,
        's=iTunes',
        `c=IN IP4 ${options.remoteIp}`,
        't=0 0',
        'm=audio 0 RTP/AVP 96',
        `a=rtpmap:96 L16/${options.sampleRate}/${options.channels}`,
        `a=fmtp:96 ${AUDIO_FRAMES_PER_PACKET} 0 ${options.bitsPerChannel} 40 10 14 ${options.channels} 255 0 0 ${options.sampleRate}`
    ].join('\r\n') + '\r\n';
}

/**
 * RTSP client for the RAOP commands: ANNOUNCE, SETUP, RECORD, SET_PARAMETER,
 * FLUSH and TEARDOWN, plus auth-setup, digest authentication, metadata and
 * artwork.
 */
export class RaopRtspClient extends RtspClient {
    /** Active-Remote identifier for DACP remote control. */
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    /** DACP identifier for remote control discovery. */
    get dacpId(): string {
        return this.#dacpId;
    }

    /** RTSP session identifier for session-scoped requests. */
    get rtspSessionId(): string {
        return this.#rtspSessionId;
    }

    /** Numeric session identifier in the RTSP URI path. */
    get sessionId(): number {
        return this.#sessionId;
    }

    /** RTSP URI of this session, in the form `rtsp://<localIp>/<sessionId>`. */
    get uri(): string {
        return `rtsp://${this.connection.localIp}/${this.#sessionId}`;
    }

    get connection(): { localIp: string; remoteIp: string } {
        return {
            localIp: this.localAddress,
            remoteIp: this.address
        };
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #rtspSessionId: string;
    readonly #sessionId: number;

    /** Digest credentials, set after a 401 challenge. */
    #digestInfo?: DigestInfo;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#rtspSessionId = generateSessionId();
        this.#sessionId = Math.floor(Math.random() * 0xFFFFFFFF);
    }

    /** Headers on every request: the DACP identifiers, User-Agent and, after a challenge, digest authorization. */
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

    /**
     * Fetches the device info plist from `/info`.
     *
     * @returns The info dictionary, or an empty object on failure.
     */
    async info(): Promise<Record<string, unknown>> {
        try {
            const response = await this.exchange('GET', '/info', {
                allowError: true
            });

            if (!response.ok) {
                return {};
            }

            const buffer = Buffer.from(await response.arrayBuffer());

            if (buffer.length === 0) {
                return {};
            }

            try {
                return Plist.parse(buffer.buffer) as Record<string, unknown>;
            } catch (err) {
                this.context.logger.warn('[raop-rtsp]', 'Failed to parse info plist', err);

                return {};
            }
        } catch (err) {
            this.context.logger.warn('[raop-rtsp]', 'Failed to get device info', err);

            return {};
        }
    }

    /**
     * Sends the Curve25519 public key to `/auth-setup`, which an AirPort
     * Express with MFi-SAP encryption requires.
     */
    async authSetup(): Promise<void> {
        const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);

        await this.exchange('POST', '/auth-setup', {
            contentType: 'application/octet-stream',
            body,
            protocol: 'HTTP/1.1'
        });
    }

    /**
     * Sends ANNOUNCE with an SDP body for the audio format. On a 401
     * challenge with a password given, it retries with HTTP Digest
     * authentication.
     *
     * @param bytesPerChannel - Bytes per sample per channel, 2 for 16-bit.
     * @param sampleRate - Sample rate in Hz.
     */
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
                        username: 'apple-protocols',
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

    /**
     * Sends SETUP to negotiate the transport (ports, protocol).
     *
     * @param headers - Extra headers, for example Transport.
     * @returns The response, with the receiver's ports in its Transport header.
     */
    async setup(headers?: Record<string, string>, body?: Buffer | string | Record<string, unknown>): Promise<Response> {
        return await this.exchange('SETUP', this.uri, {headers, body});
    }

    /**
     * Sends RECORD to start playback on the receiver.
     *
     * @param headers - Usually Range, Session and RTP-Info.
     */
    async record(headers?: Record<string, string>): Promise<void> {
        await this.exchange('RECORD', this.uri, {headers});
    }

    /**
     * Sends FLUSH to clear the receiver's audio buffer and move playback to
     * the RTP position in the headers.
     *
     * @param options - Headers with Session and RTP-Info.
     */
    async flush(options: { headers: Record<string, string> }): Promise<void> {
        await this.exchange('FLUSH', this.uri, {headers: options.headers});
    }

    /**
     * Sends a `text/parameters` SET_PARAMETER, for volume, progress and other
     * scalar values.
     *
     * @param name - For example `volume` or `progress`.
     */
    async setParameter(name: string, value: string): Promise<void> {
        await this.exchange('SET_PARAMETER', this.uri, {
            contentType: 'text/parameters',
            body: `${name}: ${value}`
        });
    }

    /**
     * Sends title, artist, album and duration as DAAP-tagged SET_PARAMETER.
     *
     * @param rtpseq - RTP sequence number for the RTP-Info header.
     * @param rtptime - RTP timestamp for the RTP-Info header.
     */
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

    /**
     * Sends album artwork as SET_PARAMETER. The magic bytes tell PNG apart;
     * anything else goes as JPEG.
     *
     * @param rtpseq - RTP sequence number for the RTP-Info header.
     * @param rtptime - RTP timestamp for the RTP-Info header.
     */
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

    /**
     * Posts to `/feedback`, which keeps the session alive during streaming.
     *
     * @param allowError - Resolves on an HTTP error status instead of throwing.
     */
    async feedback(allowError: boolean = false): Promise<Response> {
        return await this.exchange('POST', '/feedback', {allowError});
    }

    /** Sends TEARDOWN to end the streaming session. */
    async teardown(session: string): Promise<void> {
        await this.exchange('TEARDOWN', this.uri, {
            headers: {'Session': session}
        });
    }
}
