import { HTTP_TIMEOUT } from '@corewire/core';
import { Plist } from '@corewire/core/encoding';
import { type CloseReason, type Context, EncryptionState } from '@corewire/core/transport';
import { generateActiveRemoteId, generateDacpId, generateSessionId } from '../identifiers';
import { RtspClient } from '../rtsp';
import { chacha20DecryptFrames, chacha20Encrypt } from './encryption';

/** Request line protocol of play queue commands: they go as HTTP/1.1 on the RTSP connection. */
const COMMAND_PROTOCOL: 'HTTP/1.1' | 'RTSP/1.0' = 'HTTP/1.1';

/** Slightly less than the two-second feedback interval, so requests never overlap. */
const FEEDBACK_TIMEOUT = 1900;

type Body = Buffer | string | Record<string, unknown>;

/**
 * The RTSP control connection of an AirPlay session. Every request carries the session headers
 * (Active-Remote, DACP-ID, X-Apple-Session-ID); after pair-verify the connection switches to
 * ChaCha20-Poly1305 frames. Requests resolve with any status, the caller checks it.
 */
export class ControlChannel extends RtspClient {
    /** DACP remote identifier, a random unsigned 32-bit integer in decimal. */
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    /** DACP identifier, 16 uppercase hex characters. */
    get dacpId(): string {
        return this.#dacpId;
    }

    /** Identifies the session in RTSP URIs (`/<sessionId>`) and the `X-Apple-Session-ID` header. */
    get sessionId(): string {
        return this.#sessionId;
    }

    get isEncrypted(): boolean {
        return !!this.#encryptionState;
    }

    /** Settles once the TEARDOWN in flight is answered, times out or loses its connection; undefined when none is. */
    get pendingTeardown(): Promise<void> | undefined {
        return this.#pendingTeardown;
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #sessionId: string;
    #closeReason?: CloseReason;
    #encryptionState?: EncryptionState;
    #pendingTeardown?: Promise<void>;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#sessionId = generateSessionId();

        this.on('closed', reason => this.#closeReason = reason);
    }

    /** Switches to encrypted frames with the control keys from pair-verify or a transient pairing. */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryptionState = new EncryptionState(readKey, writeKey);
    }

    protected override getDefaultHeaders(): Record<string, string | number> {
        return {
            'Active-Remote': this.#activeRemoteId,
            'DACP-ID': this.#dacpId,
            'User-Agent': `AirPlay/${this.context.identity.sourceVersion}`,
            'X-Apple-ProtocolVersion': 1,
            'X-Apple-Session-ID': this.#sessionId
        };
    }

    protected override transformIncoming(data: Buffer): Buffer | {data: Buffer; consumed: number} {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20DecryptFrames(this.#encryptionState, data);
    }

    protected override transformOutgoing(data: Buffer): Buffer {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20Encrypt(this.#encryptionState, data);
    }

    /**
     * Sends a play queue command as `POST /command`, the command as a binary plist in `params.data`.
     *
     * @param streamId - Stream ID from the SETUP of the remote control stream.
     * @param sessionUUID - Session UUID from the first SETUP, sent as `X-Apple-Session-ID`.
     */
    async command(streamId: number, payload: Record<string, unknown> | ArrayBuffer, sessionUUID: string): Promise<Response> {
        // The serializer only writes plist data for an ArrayBuffer, not for a Buffer.
        const data = payload instanceof ArrayBuffer ? payload : Plist.serialize(payload as {}) as ArrayBuffer;

        return await this.exchange('POST', '/command', {
            headers: {
                'X-Apple-Session-ID': sessionUUID,
                'X-Apple-StreamID': String(streamId)
            },
            body: {params: {data}},
            protocol: COMMAND_PROTOCOL,
            allowError: true
        });
    }

    /** The keepalive a receiver expects every two seconds, optionally with stats in the body. */
    async feedback(stats?: Record<string, unknown>): Promise<Response> {
        return await this.post('/feedback', stats, undefined, FEEDBACK_TIMEOUT);
    }

    async flush(uri: string, headers: Record<string, string>): Promise<Response> {
        return await this.exchange('FLUSH', uri, {headers, allowError: true});
    }

    /** Flushes buffered audio, optionally limited by flushFromSeq/TS and flushUntilSeq/TS headers. */
    async flushBuffered(uri: string, headers: Record<string, string> = {}): Promise<Response> {
        return await this.exchange('FLUSHBUFFERED', uri, {headers, allowError: true});
    }

    async get(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('GET', path, {headers, timeout, allowError: true});
    }

    /**
     * Reads a receiver property, such as `Volume`, `VolumeDB`, `IsMuted`, `ReceiverDeviceIsPlaying`,
     * `AudioLatencyMs`, `ClusterUUID`, `UsePTPClock` or `dmcp.device-volume`. The body holds the value,
     * usually as a plist.
     */
    async getProperty(property: string): Promise<Response> {
        return await this.get(`/getProperty?${property}`);
    }

    async post(path: string, body?: Body, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('POST', path, {headers, body, timeout, allowError: true});
    }

    async put(path: string, body?: Body, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('PUT', path, {headers, body, timeout, allowError: true});
    }

    async record(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('RECORD', path, {headers, timeout, allowError: true});
    }

    /** Seeks URL playback to a position in seconds. */
    async scrub(position: number): Promise<Response> {
        return await this.exchange('POST', `/scrub?position=${position.toFixed(6)}`, {allowError: true});
    }

    /** Sets the audio routing mode, such as `default`, `moviePlayback` or `spoken`. */
    async setAudioMode(mode: string): Promise<Response> {
        const body = Plist.serialize({audioMode: mode});

        return await this.exchange('POST', '/audioMode', {
            body: Buffer.from(body),
            headers: {'Content-Type': 'application/x-apple-binary-plist'},
            allowError: true
        });
    }

    /** Sends `SET_PARAMETER` on the session with a `text/parameters` body; stream volume is set this way, in dB. */
    async setParameter(parameter: string, value: string): Promise<Response> {
        return await this.exchange('SET_PARAMETER', `/${this.sessionId}`, {
            contentType: 'text/parameters',
            body: `${parameter}: ${value}\r\n`,
            allowError: true
        });
    }

    /** Writes a receiver property; see {@link getProperty} for the known keys. */
    async setProperty(property: string, body?: Body): Promise<Response> {
        return await this.put(`/setProperty?${property}`, body);
    }

    async setup(path: string, body?: Body, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('SETUP', path, {headers, body, timeout, allowError: true});
    }

    async setVolume(volume: number): Promise<Response> {
        return await this.exchange('POST', `/volume?volume=${volume.toFixed(6)}`, {allowError: true});
    }

    /** Stops URL playback. */
    async stop(): Promise<Response> {
        return await this.exchange('POST', '/stop', {allowError: true});
    }

    /**
     * Ends the session on the receiver. A receiver that closes this connection before it answers
     * has ended the session itself, so that counts as done and resolves with undefined.
     */
    async teardown(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response | undefined> {
        const exchange = this.exchange('TEARDOWN', path, {headers, timeout, allowError: true});
        const settled = exchange.then(() => undefined, () => undefined);

        this.#pendingTeardown = settled;
        void settled.then(() => {
            if (this.#pendingTeardown === settled) {
                this.#pendingTeardown = undefined;
            }
        });

        try {
            return await exchange;
        } catch (err) {
            if (this.#closeReason !== 'remote') {
                throw err;
            }

            this.context.logger.debug('[rtsp]', 'The receiver closed the control connection before answering TEARDOWN, the session has ended.');

            return undefined;
        }
    }
}
