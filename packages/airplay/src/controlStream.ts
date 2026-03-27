import { type Context, EncryptionState, generateActiveRemoteId, generateDacpId, generateSessionId, HTTP_TIMEOUT } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { RtspClient } from '@basmilius/apple-rtsp';
import { chacha20Decrypt, chacha20Encrypt } from './encryption';

/**
 * RTSP-based control stream for AirPlay protocol communication.
 *
 * Extends {@link RtspClient} with AirPlay-specific session headers (Active-Remote,
 * DACP-ID, Session-ID) and optional ChaCha20-Poly1305 encryption that is enabled
 * after pair-verify completes. All AirPlay RTSP methods (SETUP, RECORD, FLUSH,
 * TEARDOWN, etc.) are exposed as convenience methods.
 */
export default class ControlStream extends RtspClient {
    /** Unique identifier for DACP remote control, sent in every request. */
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    /** Digital Audio Control Protocol identifier for this session. */
    get dacpId(): string {
        return this.#dacpId;
    }

    /** AirPlay session identifier, used in RTSP URIs and headers. */
    get sessionId(): string {
        return this.#sessionId;
    }

    /** Whether the control stream has encryption enabled. */
    get isEncrypted(): boolean {
        return !!this.#encryptionState;
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #sessionId: string;
    #encryptionState?: EncryptionState;

    /**
     * @param context - Shared context with logger and device identity.
     * @param address - IP address of the AirPlay receiver.
     * @param port - TCP port of the AirPlay RTSP server.
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#sessionId = generateSessionId();
    }

    /**
     * Enables ChaCha20-Poly1305 encryption on the control stream.
     *
     * Called after pair-verify completes, using the derived control stream keys.
     * Once enabled, all subsequent RTSP requests and responses are encrypted.
     *
     * @param readKey - 32-byte key for decrypting incoming data (accessory-to-controller).
     * @param writeKey - 32-byte key for encrypting outgoing data (controller-to-accessory).
     */
    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryptionState = new EncryptionState(readKey, writeKey);
    }

    /**
     * Returns AirPlay-specific default RTSP headers included in every request.
     *
     * @returns Header map with Active-Remote, DACP-ID, User-Agent, protocol version, and session ID.
     */
    protected override getDefaultHeaders(): Record<string, string | number> {
        return {
            'Active-Remote': this.#activeRemoteId,
            'DACP-ID': this.#dacpId,
            'User-Agent': `AirPlay/${this.context.identity.sourceVersion}`,
            'X-Apple-ProtocolVersion': 1,
            'X-Apple-Session-ID': this.#sessionId
        };
    }

    /**
     * Decrypts incoming RTSP data if encryption is enabled.
     *
     * @param data - Raw data from the TCP socket.
     * @returns Decrypted data, passthrough if unencrypted, or `false` if incomplete.
     */
    protected override transformIncoming(data: Buffer): Buffer | false {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20Decrypt(this.#encryptionState, data);
    }

    /**
     * Encrypts outgoing RTSP data if encryption is enabled.
     *
     * @param data - Plaintext data to send.
     * @returns Encrypted data, or passthrough if unencrypted.
     */
    protected override transformOutgoing(data: Buffer): Buffer {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20Encrypt(this.#encryptionState, data);
    }

    /**
     * Sends an RTSP FLUSH request to reset the playback buffer.
     *
     * @param uri - RTSP resource URI (typically `/{sessionId}`).
     * @param headers - Additional headers, usually including Range and RTP-Info.
     * @returns The RTSP response.
     */
    async flush(uri: string, headers: Record<string, string>): Promise<Response> {
        return await this.exchange('FLUSH', uri, {headers, allowError: true});
    }

    /**
     * Sends an HTTP-style GET request over the RTSP connection.
     *
     * @param path - Request path (e.g. `/info`, `/playback-info`).
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response.
     */
    async get(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('GET', path, {headers, timeout, allowError: true});
    }

    /**
     * Sends an HTTP-style POST request over the RTSP connection.
     *
     * @param path - Request path (e.g. `/play`, `/feedback`, `/pair-setup`).
     * @param body - Optional request body (Buffer, string, or plist-serializable object).
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response.
     */
    async post(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('POST', path, {headers, body, timeout, allowError: true});
    }

    /**
     * Sends an HTTP-style PUT request over the RTSP connection.
     *
     * @param path - Request path (e.g. `/setProperty?...`).
     * @param body - Optional request body.
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response.
     */
    async put(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('PUT', path, {headers, body, timeout, allowError: true});
    }

    /**
     * Sends an RTSP RECORD request to start media streaming.
     *
     * @param path - RTSP resource URI (typically `/{sessionId}`).
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response.
     */
    async record(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('RECORD', path, {headers, timeout, allowError: true});
    }

    /**
     * Sends an RTSP SETUP request to configure a new stream.
     *
     * @param path - RTSP resource URI (typically `/{sessionId}`).
     * @param body - Plist body with stream configuration.
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response containing port assignments and stream parameters.
     */
    async setup(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('SETUP', path, {headers, body, timeout, allowError: true});
    }

    /**
     * Sends an RTSP SET_PARAMETER request.
     *
     * @param parameter - Parameter name (e.g. 'volume').
     * @param value - Parameter value as a string.
     * @returns The response.
     */
    async setParameter(parameter: string, value: string): Promise<Response> {
        return await this.exchange('SET_PARAMETER', `/${this.sessionId}`, {
            contentType: 'text/parameters',
            body: `${parameter}: ${value}\r\n`,
            allowError: true
        });
    }

    /**
     * Sets the playback volume via a POST request.
     *
     * @param volume - Volume level (typically -144 to 0 dB, or 0 to 1 normalized).
     * @returns The response.
     */
    async setVolume(volume: number): Promise<Response> {
        return await this.exchange('POST', `/volume?volume=${volume.toFixed(6)}`, {
            allowError: true
        });
    }

    /**
     * Sets the audio routing mode on the receiver.
     *
     * @param mode - The audio mode to set (e.g. 'default', 'moviePlayback', 'spoken').
     * @returns The response.
     */
    async setAudioMode(mode: string): Promise<Response> {
        const body = Plist.serialize({audioMode: mode});

        return await this.exchange('POST', '/audioMode', {
            body: Buffer.from(body),
            headers: {'Content-Type': 'application/x-apple-binary-plist'},
            allowError: true
        });
    }

    /**
     * Stops the current URL playback session.
     *
     * @returns The response.
     */
    async stop(): Promise<Response> {
        return await this.exchange('POST', '/stop', {allowError: true});
    }

    /**
     * Seeks to a specific position during URL playback.
     *
     * @param position - The position in seconds to seek to.
     * @returns The response.
     */
    async scrub(position: number): Promise<Response> {
        return await this.exchange('POST', `/scrub?position=${position.toFixed(6)}`, {allowError: true});
    }

    /**
     * Sends an RTSP FLUSHBUFFERED request to flush buffered audio.
     *
     * More targeted than FLUSH — specifically for buffered audio sessions.
     * Supports range-based flushing via flushFromSeq/TS and flushUntilSeq/TS headers.
     *
     * @param uri - RTSP resource URI (typically `/{sessionId}`).
     * @param headers - Additional headers (e.g. flush range parameters).
     * @returns The RTSP response.
     */
    async flushBuffered(uri: string, headers: Record<string, string> = {}): Promise<Response> {
        return await this.exchange('FLUSHBUFFERED', uri, {headers, allowError: true});
    }

    /**
     * Gets a property from the AirPlay receiver.
     *
     * Known property keys (from AirPlayReceiver framework):
     *
     * **Volume:**
     * - `Volume` — current volume
     * - `VolumeDB` — volume in decibels
     * - `VolumeLinear` — linear volume (0.0-1.0)
     * - `SoftwareVolume` — software volume level
     * - `VolumeControlType` / `VolumeControlTypeEx` — volume control capabilities
     * - `IsMuted` / `MuteForStream` — mute state
     *
     * **Playback:**
     * - `ReceiverDeviceIsPlaying` — whether the device is currently playing
     * - `IsPlayingBufferedAudio` — whether buffered audio is active
     * - `DenyInterruptions` — interruption prevention state
     *
     * **Audio:**
     * - `AudioFormat` — current audio format
     * - `AudioLatencyMs` / `AudioLatencyMax` / `AudioLatencyMin` — latency info
     * - `RedundantAudio` — redundancy status
     * - `SpatialAudio` / `SpatialAudioActive` / `SpatialAudioAllowed` — spatial audio state
     *
     * **Device:**
     * - `DeviceID` / `DeviceName` — device identity
     * - `IdleTimeout` — idle timeout value
     * - `SecurityMode` — security mode
     * - `ReceiverMode` — current receiver mode
     *
     * **Display:**
     * - `DisplayHDRMode` — HDR mode
     * - `DisplaySize` / `DisplaySizeMax` — display dimensions
     * - `DisplayUUID` — display identifier
     *
     * **Cluster/Multi-room:**
     * - `ClusterUUID` / `ClusterType` / `ClusterSize` — cluster info
     * - `IsClusterLeader` / `ClusterLeaderUUID` — cluster leadership
     * - `TightSyncUUID` / `IsTightSyncGroupLeader` — tight sync state
     * - `GroupContainsDiscoverableLeader` / `GroupContextID` — group info
     *
     * **Network:**
     * - `UsePTPClock` — PTP clock usage
     * - `NetworkClock` — network clock type
     *
     * **DACP-style (via setproperty? URL):**
     * - `dmcp.device-volume` — DACP device volume
     * - `dmcp.device-prevent-playback` — DACP prevent playback
     *
     * @param property - The property key to query.
     * @returns The response (body contains the property value, typically as plist).
     */
    async getProperty(property: string): Promise<Response> {
        return await this.get(`/getProperty?${property}`);
    }

    /**
     * Sets a property on the AirPlay receiver.
     *
     * See {@link getProperty} for the full list of known property keys.
     * For set operations, the property string contains key=value pairs.
     *
     * @param property - The property key=value to set (e.g. `Volume=0.5`).
     * @param body - Optional request body for complex property values (plist).
     * @returns The response.
     */
    async setProperty(property: string, body?: Buffer | string | Record<string, unknown>): Promise<Response> {
        return await this.put(`/setProperty?${property}`, body);
    }

    /**
     * Sends an RTSP TEARDOWN request to end a stream session.
     *
     * @param path - RTSP resource URI (typically `/{sessionId}`).
     * @param headers - Additional request headers.
     * @param timeout - Request timeout in milliseconds.
     * @returns The response.
     */
    async teardown(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('TEARDOWN', path, {headers, timeout, allowError: true});
    }
}
