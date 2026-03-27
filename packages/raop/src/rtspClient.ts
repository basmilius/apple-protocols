import { createHash } from 'node:crypto';
import { AUDIO_FRAMES_PER_PACKET, type Context, generateActiveRemoteId, generateDacpId, generateSessionId } from '@basmilius/apple-common';
import { DAAP, Plist } from '@basmilius/apple-encoding';
import { RtspClient } from '@basmilius/apple-rtsp';
import type { MediaMetadata } from './types';

/** User-Agent header value sent with all RTSP requests. */
const USER_AGENT = 'AirPlay/550.10';

/** Single-byte flag indicating unencrypted auth-setup mode. */
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

/**
 * Static Curve25519 public key sent during `/auth-setup` for
 * MFi-SAP authentication with AirPort Express devices.
 */
const CURVE25519_PUB_KEY = Buffer.from([
    0x59, 0x02, 0xed, 0xe9, 0x0d, 0x4e, 0xf2, 0xbd,
    0x4c, 0xb6, 0x8a, 0x63, 0x30, 0x03, 0x82, 0x07,
    0xa9, 0x4d, 0xbd, 0x50, 0xd8, 0xaa, 0x46, 0x5b,
    0x5d, 0x8c, 0x01, 0x2a, 0x0c, 0x7e, 0x1d, 0x4e
]);

/**
 * Options for building an SDP ANNOUNCE payload describing
 * the audio format of the stream to be set up.
 */
type AnnouncePayloadOptions = {
    /** Random session identifier for this RTSP session. */
    readonly sessionId: number;
    /** Local IP address of the sender. */
    readonly localIp: string;
    /** IP address of the RAOP receiver. */
    readonly remoteIp: string;
    /** Bits per audio channel sample (e.g. 16). */
    readonly bitsPerChannel: number;
    /** Number of audio channels (e.g. 2). */
    readonly channels: number;
    /** Audio sample rate in Hz (e.g. 44100). */
    readonly sampleRate: number;
};

/**
 * HTTP Digest authentication credentials extracted from
 * a 401 WWW-Authenticate challenge response.
 */
type DigestInfo = {
    /** Authentication username. */
    readonly username: string;
    /** Digest realm from the challenge. */
    readonly realm: string;
    /** Password for the RAOP device. */
    readonly password: string;
    /** Server-provided nonce for the digest calculation. */
    readonly nonce: string;
};

/**
 * Computes an HTTP Digest authentication header value using MD5.
 *
 * @param method - RTSP method (may be empty for default headers).
 * @param uri - Request URI.
 * @param info - Digest credentials and challenge parameters.
 * @returns Formatted Digest authorization header value.
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

/**
 * Builds an SDP (Session Description Protocol) body for the RTSP
 * ANNOUNCE request, describing the audio format and codec parameters.
 *
 * @param options - Audio format and connection details.
 * @returns SDP payload string with CRLF line endings.
 */
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
 * RAOP-specific RTSP client that extends the base RTSP client with
 * Apple audio streaming commands. Handles the full RAOP RTSP lifecycle:
 * ANNOUNCE, SETUP, RECORD, SET_PARAMETER, FLUSH, TEARDOWN, as well as
 * authentication (auth-setup, digest) and metadata/artwork publishing.
 */
export default class RaopRtspClient extends RtspClient {
    /** Active-Remote identifier used for DACP remote control pairing. */
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    /** DACP identifier used for remote control discovery. */
    get dacpId(): string {
        return this.#dacpId;
    }

    /** RTSP session identifier string included in session-scoped requests. */
    get rtspSessionId(): string {
        return this.#rtspSessionId;
    }

    /** Numeric session identifier used in the RTSP URI path. */
    get sessionId(): number {
        return this.#sessionId;
    }

    /** RTSP URI for this session, formatted as `rtsp://<localIp>/<sessionId>`. */
    get uri(): string {
        return `rtsp://${this.connection.localIp}/${this.#sessionId}`;
    }

    /** Local and remote IP addresses of the RTSP connection. */
    get connection(): { localIp: string; remoteIp: string } {
        return {
            localIp: this.localAddress,
            remoteIp: this.address
        };
    }

    /** Generated Active-Remote identifier for DACP. */
    readonly #activeRemoteId: string;
    /** Generated DACP identifier for remote control. */
    readonly #dacpId: string;
    /** Generated RTSP session identifier. */
    readonly #rtspSessionId: string;
    /** Random numeric session identifier for the RTSP URI. */
    readonly #sessionId: number;
    /** Digest authentication credentials, set after a 401 challenge. */
    #digestInfo?: DigestInfo;

    /**
     * Creates a new RAOP RTSP client and generates unique session identifiers.
     *
     * @param context - Application context for logging and device identity.
     * @param address - IP address of the RAOP receiver.
     * @param port - RTSP port of the RAOP receiver.
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#rtspSessionId = generateSessionId();
        this.#sessionId = Math.floor(Math.random() * 0xFFFFFFFF);
    }

    /**
     * Returns default headers included with every RTSP request, including
     * DACP identifiers, user-agent, and digest authorization if available.
     *
     * @returns Header key-value pairs.
     */
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
     * Fetches device information from the `/info` endpoint. Returns the
     * parsed plist response as a dictionary, or an empty object on failure.
     *
     * @returns Device info dictionary, or empty object if unavailable.
     */
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

    /**
     * Performs MFi-SAP authentication setup by sending a Curve25519 public
     * key to `/auth-setup`. Required for AirPort Express devices that use
     * MFi-SAP encryption.
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
     * Sends an RTSP ANNOUNCE request with an SDP body describing the audio
     * format. If the receiver responds with a 401 challenge and a password
     * is provided, retries with HTTP Digest authentication.
     *
     * @param bytesPerChannel - Bytes per audio channel sample (e.g. 2 for 16-bit).
     * @param channels - Number of audio channels.
     * @param sampleRate - Audio sample rate in Hz.
     * @param password - Optional password for digest authentication.
     * @returns The RTSP response.
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
     * Sends an RTSP SETUP request to negotiate transport parameters
     * (ports, protocol) with the receiver.
     *
     * @param headers - Optional additional headers (e.g. Transport).
     * @param body - Optional request body.
     * @returns The RTSP response containing server-assigned ports in the Transport header.
     */
    async setup(headers?: Record<string, string>, body?: Buffer | string | Record<string, unknown>): Promise<Response> {
        return await this.exchange('SETUP', this.uri, {headers, body});
    }

    /**
     * Sends an RTSP RECORD request to begin audio playback on the receiver.
     * Includes RTP-Info and Range headers for stream positioning.
     *
     * @param headers - Optional headers (typically Range, Session, RTP-Info).
     */
    async record(headers?: Record<string, string>): Promise<void> {
        await this.exchange('RECORD', this.uri, {headers});
    }

    /**
     * Sends an RTSP FLUSH request to clear the receiver's audio buffer
     * and reset playback to the specified RTP position.
     *
     * @param options - Headers including Session and RTP-Info for flush positioning.
     */
    async flush(options: { headers: Record<string, string> }): Promise<void> {
        await this.exchange('FLUSH', this.uri, {headers: options.headers});
    }

    /**
     * Sends a SET_PARAMETER request with a text/parameters content type.
     * Used for setting volume, progress, and other scalar parameters.
     *
     * @param name - Parameter name (e.g. "volume", "progress").
     * @param value - Parameter value as a string.
     */
    async setParameter(name: string, value: string): Promise<void> {
        await this.exchange('SET_PARAMETER', this.uri, {
            contentType: 'text/parameters',
            body: `${name}: ${value}`
        });
    }

    /**
     * Sends track metadata (title, artist, album, duration) to the receiver
     * as DAAP-tagged data via SET_PARAMETER.
     *
     * @param session - RTSP session identifier.
     * @param rtpseq - Current RTP sequence number for the RTP-Info header.
     * @param rtptime - Current RTP timestamp for the RTP-Info header.
     * @param metadata - Track metadata to send.
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
     * Sends album artwork to the receiver via SET_PARAMETER. Automatically
     * detects PNG images by magic bytes, defaulting to JPEG otherwise.
     *
     * @param session - RTSP session identifier.
     * @param rtpseq - Current RTP sequence number for the RTP-Info header.
     * @param rtptime - Current RTP timestamp for the RTP-Info header.
     * @param artwork - Image data buffer (JPEG or PNG).
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
     * Sends a feedback request to `/feedback` to keep the session alive.
     * Typically called periodically during active streaming.
     *
     * @param allowError - Whether to suppress HTTP error responses.
     * @returns The feedback response.
     */
    async feedback(allowError: boolean = false): Promise<Response> {
        return await this.exchange('POST', '/feedback', {allowError});
    }

    /**
     * Sends an RTSP TEARDOWN request to end the streaming session
     * and release server-side resources.
     *
     * @param session - RTSP session identifier to tear down.
     */
    async teardown(session: string): Promise<void> {
        await this.exchange('TEARDOWN', this.uri, {
            headers: {'Session': session}
        });
    }
}
