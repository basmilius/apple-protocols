import { type AudioSource, Context, type DeviceIdentity, type DiscoveryResult, getMacAddress, InvalidResponseError, PlaybackError, randomInt64, SetupError, type TimingServer, uuid, waitFor } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { Pairing, Verify } from './pairing';
import AudioStream from './audioStream';
import ControlStream from './controlStream';
import DataStream from './dataStream';
import EventStream from './eventStream';

import { decodeFeatures, hasFeature, SENDER_FEATURES_AUDIO, SENDER_FEATURES_REMOTE_CONTROL } from './features';

/** Interval in milliseconds between feedback keepalive requests during URL playback. */
const FEEDBACK_INTERVAL = 2000;

/** Maximum number of retry attempts for the POST /play request. */
const PLAY_RETRIES = 3;

/** Interval in milliseconds between playback info polling checks. */
const PLAYBACK_POLL_INTERVAL = 1000;

/** Number of consecutive empty playback info responses before considering playback ended. */
const PLAYBACK_IDLE_THRESHOLD = 5;

/**
 * Playback information returned by GET /playback-info.
 */
export type PlaybackInfo = {
    duration?: number;
    position?: number;
    rate?: number;
    readyToPlay?: boolean;
    error?: { code: number; domain: string };
};

/**
 * Main AirPlay 2 protocol orchestrator.
 *
 * Manages the full lifecycle of an AirPlay session: RTSP control stream,
 * pair-setup/pair-verify, event stream, data stream (MRP), audio stream,
 * and URL playback. Each session gets a unique UUID and maintains its own
 * pairing and verification instances.
 *
 * Typical remote control flow:
 * 1. `connect()` - TCP connection to RTSP server
 * 2. `fetchInfo()` - GET /info for receiver capabilities
 * 3. `verify.start()` - Pair-verify with stored credentials
 * 4. `setupEventStream()` - SETUP + event stream connection
 * 5. `setupDataStream()` - SETUP + data stream (MRP) connection
 * 6. Send commands via `dataStream.send()` / `dataStream.exchange()`
 *
 * For audio streaming, use `setupAudioStream()` or `playUrl()` instead of steps 5-6.
 */
export default class Protocol {
    /** Shared context with logger, device identity, and storage. */
    get context(): Context {
        return this.#context;
    }

    /** The RTSP control stream for sending requests to the receiver. */
    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    /** The MRP data stream for protobuf-based remote control, or undefined if not yet set up. */
    get dataStream(): DataStream | undefined {
        return this.#dataStream;
    }

    /** The mDNS discovery result that identified this receiver. */
    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    /** The active audio stream, or undefined if not streaming audio. */
    get audioStream(): AudioStream | undefined {
        return this.#audioStream;
    }

    /** The reverse HTTP event stream from the receiver, or undefined if not yet set up. */
    get eventStream(): EventStream | undefined {
        return this.#eventStream;
    }

    /** The pair-setup handler for this protocol instance. */
    get pairing(): Pairing {
        return this.#pairing;
    }

    /** Unique session UUID for this AirPlay session, used in RTSP URIs and SETUP bodies. */
    get sessionUUID(): string {
        return this.#sessionUUID;
    }

    /** The pair-verify handler for this protocol instance. */
    get verify(): Verify {
        return this.#verify;
    }

    readonly #context: Context;
    readonly #controlStream: ControlStream;
    readonly #discoveryResult: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #sessionUUID: string;
    readonly #verify: Verify;
    #audioStream?: AudioStream;
    #dataStream?: DataStream;
    #eventStream?: EventStream;
    #playUrlFeedbackInterval?: NodeJS.Timeout;
    #receiverFeatures: bigint = 0n;
    #receiverInfo?: Record<string, any>;
    #timingServer?: TimingServer;

    /**
     * @param discoveryResult - The mDNS discovery result with address and port.
     * @param identity - Optional partial device identity overrides.
     */
    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        this.#context = new Context(discoveryResult.id, identity);
        this.#discoveryResult = discoveryResult;
        this.#sessionUUID = uuid();
        this.#controlStream = new ControlStream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    /** Feature bitmask advertised by the receiver in its /info response. */
    get receiverFeatures(): bigint {
        return this.#receiverFeatures;
    }

    /** Full /info plist response from the receiver, or undefined if not yet fetched. */
    get receiverInfo(): Record<string, any> | undefined {
        return this.#receiverInfo;
    }

    /**
     * Checks whether the receiver supports a specific AirPlay feature.
     *
     * @param feature - The feature flag to check (from {@link AirPlayFeature}).
     * @returns `true` if the receiver advertises support for this feature.
     */
    hasReceiverFeature(feature: bigint): boolean {
        return hasFeature(this.#receiverFeatures, feature);
    }

    /**
     * Opens the TCP connection to the AirPlay RTSP server.
     */
    async connect(): Promise<void> {
        await this.#controlStream.connect();
    }

    /**
     * Fetches device information via GET /info.
     *
     * Parses the receiver's feature bitmask, name, model, and source version.
     * If the receiver's source version is lower than ours, caps our advertised
     * version to avoid claiming unsupported capabilities.
     *
     * @returns The parsed /info plist as a key-value record.
     */
    async fetchInfo(): Promise<Record<string, any>> {
        const response = await this.#controlStream.get('/info');

        if (response.status !== 200) {
            this.context.logger.warn('[protocol]', `GET /info failed: ${response.status}`);
            return {};
        }

        const info = Plist.parse(await response.arrayBuffer()) as Record<string, any>;
        this.#receiverInfo = info;

        const receiverSourceVersion = info.sourceVersion as string | undefined;

        if (info.features != null) {
            this.#receiverFeatures = BigInt(info.features);
        }

        this.context.logger.info('[protocol]', `Receiver: ${info.name ?? 'unknown'}, model=${info.model ?? '?'}, sourceVersion=${receiverSourceVersion ?? '?'}`);
        this.context.logger.info('[protocol]', `Receiver features: ${decodeFeatures(this.#receiverFeatures).join(', ')}`);

        if (info.initialVolume != null) {
            this.context.logger.info('[protocol]', `Receiver initial volume: ${info.initialVolume}`);
        }

        // Use the receiver's sourceVersion if it's lower than ours, to avoid
        // claiming capabilities the receiver doesn't understand.
        if (receiverSourceVersion) {
            const ours = parseFloat(this.#context.identity.sourceVersion);
            const theirs = parseFloat(receiverSourceVersion);

            if (theirs < ours) {
                this.context.logger.info('[protocol]', `Capping sourceVersion from ${this.#context.identity.sourceVersion} to ${receiverSourceVersion}`);
                (this.#context.identity as any).sourceVersion = receiverSourceVersion;
            }
        }

        return info;
    }

    /**
     * Forcefully destroys all streams and the control connection.
     *
     * Unlike {@link disconnect}, does not gracefully close individual streams
     * and does not catch errors.
     */
    destroy(): void {
        this.#audioStream?.close();
        this.#controlStream.destroy();
        this.#dataStream?.destroy();
        this.#eventStream?.destroy();
    }

    /**
     * Gracefully disconnects all streams and the control connection.
     *
     * Closes audio, data, event, and control streams in order, catching and
     * logging errors for each. Stops the feedback keepalive loop and clears
     * all stream references.
     */
    disconnect(): void {
        try {
            this.#audioStream?.close();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error closing audio stream', err);
        }

        try {
            this.#dataStream?.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying data stream', err);
        }

        try {
            this.#eventStream?.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying event stream', err);
        }

        try {
            this.#controlStream.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying control stream', err);
        }

        this.#stopPlayUrlFeedback();
        this.#audioStream = undefined;
        this.#dataStream = undefined;
        this.#eventStream = undefined;
        this.#timingServer = undefined;
    }

    /**
     * Sends a POST /feedback keepalive request to the receiver.
     *
     * The feedback loop keeps the AirPlay session alive. Uses a 1.9s timeout
     * (slightly less than the 2s interval) to avoid overlapping requests.
     */
    async feedback(): Promise<void> {
        // note: Default feedback interval is 2s, so a timeout of 1.9s should be fine.
        await this.#controlStream.post('/feedback', undefined, undefined, 1900);
    }

    /**
     * Sets the playback volume on the receiver.
     *
     * @param volume - Volume level to set.
     */
    async setVolume(volume: number): Promise<void> {
        await this.#controlStream.setVolume(volume);
    }

    /**
     * Sets up and connects the MRP data stream for protobuf-based remote control.
     *
     * Sends an RTSP SETUP request for a type 130 (MRP) stream with a dedicated
     * socket, then derives encryption keys from the shared secret and a random
     * seed. Connects to the data port returned by the receiver.
     *
     * @param sharedSecret - Shared secret from pair-verify for key derivation.
     * @param onBeforeConnect - Optional callback invoked after setup but before TCP connect, useful for registering event listeners.
     * @throws SetupError if the SETUP request fails.
     */
    async setupDataStream(sharedSecret: Buffer, onBeforeConnect?: () => void): Promise<void> {
        const seed = randomInt64();

        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, {
            streams: [{
                controlType: 2,
                channelID: uuid().toUpperCase(),
                seed,
                clientUUID: uuid().toUpperCase(),
                type: 130,
                wantsDedicatedSocket: true,
                clientTypeUUID: '1910A70F-DBC0-4242-AF95-115DB30604E1'
            }]
        });

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed to setup data stream.', response.status, response.statusText, await response.text());
            throw new SetupError('Failed to setup data stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const dataPort = plist.streams[0].dataPort & 0xFFFF;
        this.context.logger.net('[protocol]', `Connecting to data stream on port ${dataPort}...`);

        this.#dataStream = new DataStream(this.context, this.#controlStream.address, dataPort);
        this.#dataStream.setup(sharedSecret, seed);

        onBeforeConnect?.();

        await this.#dataStream.connect();
    }

    /**
     * Sends an RTSP SETUP request and parses the plist response.
     *
     * @param body - Plist body for the SETUP request.
     * @param sharedSecret - Optional shared secret (unused, reserved for future use).
     * @returns Parsed plist response from the receiver.
     * @throws SetupError if the SETUP request returns a non-200 status.
     */
    async #performSetup(body: Record<string, string | number | boolean>, sharedSecret?: Buffer): Promise<any> {
        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, body);

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed SETUP request.', response.status, response.statusText, await response.text());
            throw new SetupError('SETUP request failed.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;

        if (plist.enabledFeatures != null) {
            this.context.logger.info('[protocol]', `Receiver enabled features: 0x${BigInt(plist.enabledFeatures).toString(16)}`);
        }

        if (plist.keepAlivePort != null) {
            this.context.logger.info('[protocol]', `Receiver keep-alive port: ${plist.keepAlivePort}`);
        }

        return plist;
    }

    /**
     * Builds the common SETUP request body with device identity and features.
     *
     * @param pairingId - The pairing identifier from pair-verify.
     * @param features - Feature bitmask to advertise in this session.
     * @returns Plist-serializable body with device metadata and session identifiers.
     */
    #setupBody(pairingId: Buffer, features: bigint): Record<string, any> {
        const id = this.#context.identity;

        return {
            deviceID: pairingId.toString(),
            features: Number(features & 0xFFFFFFFFn),
            featuresEx: Number(features >> 32n),
            macAddress: getMacAddress().toUpperCase(),
            model: id.model,
            name: id.name,
            osBuildVersion: id.osBuildVersion,
            osName: id.osName,
            osVersion: id.osVersion,
            sourceVersion: id.sourceVersion,
            sessionUUID: this.#sessionUUID,
            sessionCorrelationUUID: this.#sessionUUID.toUpperCase()
        };
    }

    /**
     * Sets up and connects the event stream for remote control sessions.
     *
     * Sends an RTSP SETUP with remote-control-only features, connects to the
     * event port, enables encryption, and sends RECORD to start the session.
     *
     * @param sharedSecret - Shared secret from pair-verify for encryption key derivation.
     * @param pairingId - Pairing identifier from pair-verify for the SETUP body.
     */
    async setupEventStream(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const body: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_REMOTE_CONTROL),
            timingProtocol: 'None',
            isRemoteControlOnly: true
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const plist = await this.#performSetup(body, sharedSecret);
        const eventPort = plist.eventPort & 0xFFFF;

        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    /**
     * Sets up and connects the event stream for audio streaming sessions.
     *
     * Similar to {@link setupEventStream} but advertises audio streaming features
     * and includes multi-select AirPlay and group UUID parameters needed for
     * audio playback.
     *
     * @param sharedSecret - Shared secret from pair-verify for encryption key derivation.
     * @param pairingId - Pairing identifier from pair-verify for the SETUP body.
     */
    async setupEventStreamForAudioStreaming(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const groupUUID = uuid().toUpperCase();

        const body: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_AUDIO),
            groupContainsGroupLeader: false,
            groupUUID,
            isMultiSelectAirPlay: true,
            senderSupportsRelay: false,
            statsCollectionEnabled: false,
            supportsGroupCohesion: true,
            timingProtocol: 'None',
            updateSessionRequest: false
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const plist = await this.#performSetup(body, sharedSecret);
        const eventPort = plist.eventPort & 0xFFFF;

        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    /**
     * Plays a URL on the AirPlay receiver (device-side playback).
     *
     * Performs the full setup flow: SETUP, event stream, RECORD, then POST /play
     * with the URL. Starts a feedback keepalive loop and retries on 500 errors.
     * After successful play, configures playback properties (action at end,
     * rate, end times).
     *
     * The receiver fetches and plays the URL itself -- this is different from
     * audio streaming where we send PCM data via RTP.
     *
     * @param url - The URL to play (must be accessible from the receiver).
     * @param sharedSecret - Shared secret from pair-verify.
     * @param pairingId - Pairing identifier from pair-verify.
     * @param position - Start position in seconds (defaults to 0).
     * @throws SetupError if the initial SETUP fails.
     * @throws PlaybackError if the play request fails after all retries.
     */
    async playUrl(url: string, sharedSecret: Buffer, pairingId: Buffer, position: number = 0): Promise<void> {
        const setupBody: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_AUDIO),
            isMultiSelectAirPlay: true,
            groupContainsGroupLeader: false,
            senderSupportsRelay: false,
            statsCollectionEnabled: false
        };

        if (this.#timingServer) {
            setupBody.timingPort = this.#timingServer.port;
            setupBody.timingProtocol = 'NTP';
        } else {
            setupBody.timingProtocol = 'None';
        }

        const setupResponse = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, setupBody);

        if (setupResponse.status !== 200) {
            throw new SetupError(`Failed to setup for playback: ${setupResponse.status}`);
        }

        const setupPlist = Plist.parse(await setupResponse.arrayBuffer()) as any;
        const eventPort = setupPlist.eventPort & 0xFFFF;

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);
        await this.#eventStream.connect();

        // Start feedback loop before RECORD/play (keeps session alive).
        this.#startPlayUrlFeedback();

        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);

        // Retry POST /play on 500 errors (device may need time to prepare).
        let lastStatus = 0;

        for (let retry = 0; retry < PLAY_RETRIES; retry++) {
            const response = await this.#controlStream.post('/play', {
                'Content-Location': url,
                'Start-Position-Seconds': position,
                uuid: this.#sessionUUID.toUpperCase(),
                streamType: 1,
                mediaType: 'file',
                volume: 1.0,
                rate: 1.0,
                clientBundleID: 'com.basmilius.apple-protocols',
                clientProcName: this.#context.identity.name,
                osBuildVersion: this.#context.identity.osBuildVersion,
                model: this.#context.identity.model,
                SenderMACAddress: getMacAddress().toUpperCase()
            });

            lastStatus = response.status;
            this.context.logger.info('[protocol]', `play_url response: ${lastStatus} (attempt ${retry + 1}/${PLAY_RETRIES})`);

            if (lastStatus === 200) {
                break;
            }

            if (lastStatus === 500) {
                this.context.logger.warn('[protocol]', 'play_url returned 500, retrying...');
                await waitFor(1000);
                continue;
            }

            if (lastStatus >= 400) {
                this.#stopPlayUrlFeedback();
                throw new PlaybackError(`Failed to play URL: ${lastStatus}`);
            }
        }

        if (lastStatus !== 200) {
            this.#stopPlayUrlFeedback();
            throw new PlaybackError(`Failed to play URL after ${PLAY_RETRIES} retries: ${lastStatus}`);
        }

        await this.#putProperty('isInterestedInDateRange', {value: true});
        await this.#putProperty('actionAtItemEnd', {value: 0});
        await this.#controlStream.post('/rate?value=1.000000');
        await this.#putProperty('forwardEndTime', {value: {flags: 0, value: 0, epoch: 0, timescale: 0}});
        await this.#putProperty('reverseEndTime', {value: {flags: 0, value: 0, epoch: 0, timescale: 0}});
    }

    /**
     * Retrieves current playback information via GET /playback-info.
     *
     * @returns Playback info with duration, position, rate, and error state; null on failure; empty object if no content is playing.
     */
    async getPlaybackInfo(): Promise<PlaybackInfo | null> {
        try {
            const response = await this.#controlStream.get('/playback-info');

            if (!response.ok) {
                return null;
            }

            const body = await response.arrayBuffer();

            if (body.byteLength === 0) {
                return {};
            }

            return Plist.parse(body) as PlaybackInfo;
        } catch {
            return null;
        }
    }

    /**
     * Polls playback info until playback ends, then stops the feedback loop.
     *
     * Waits for the first response with a duration (playback started), then
     * counts consecutive responses without a duration. After
     * {@link PLAYBACK_IDLE_THRESHOLD} consecutive idle responses, assumes
     * playback has ended.
     *
     * @throws PlaybackError if the receiver reports a playback error.
     */
    async waitForPlaybackEnd(): Promise<void> {
        let playbackStarted = false;
        let idleCount = 0;

        while (true) {
            const info = await this.getPlaybackInfo();

            if (!info) {
                this.context.logger.debug('[protocol]', 'Connection lost, assuming playback stopped.');
                break;
            }

            if (info.error) {
                this.#stopPlayUrlFeedback();
                throw new PlaybackError(`Playback error: ${info.error.code} (${info.error.domain})`);
            }

            if (info.duration !== undefined) {
                playbackStarted = true;
                idleCount = 0;
            } else if (playbackStarted) {
                idleCount++;

                if (idleCount >= PLAYBACK_IDLE_THRESHOLD) {
                    this.context.logger.debug('[protocol]', 'Playback ended.');
                    break;
                }
            }

            await waitFor(PLAYBACK_POLL_INTERVAL);
        }

        this.#stopPlayUrlFeedback();
    }

    /**
     * Stops the URL playback feedback keepalive loop.
     *
     * Call this to end a `playUrl` session without waiting for playback to
     * finish naturally.
     */
    stopPlayUrl(): void {
        this.#stopPlayUrlFeedback();
    }

    /**
     * Starts the periodic feedback keepalive loop for URL playback sessions.
     */
    #startPlayUrlFeedback(): void {
        this.#stopPlayUrlFeedback();
        this.#playUrlFeedbackInterval = setInterval(async () => {
            try {
                await this.feedback();
            } catch (err) {
                this.#context.logger.warn('[protocol]', 'playUrl feedback error', err);
            }
        }, FEEDBACK_INTERVAL);
    }

    /**
     * Stops the periodic feedback keepalive loop.
     */
    #stopPlayUrlFeedback(): void {
        if (this.#playUrlFeedbackInterval) {
            clearInterval(this.#playUrlFeedbackInterval);
            this.#playUrlFeedbackInterval = undefined;
        }
    }

    /**
     * Sets a playback property on the receiver via PUT /setProperty.
     *
     * @param property - Property name (used as query parameter).
     * @param body - Property value as a plist-serializable object.
     */
    async #putProperty(property: string, body: any): Promise<void> {
        await this.#controlStream.put(`/setProperty?${property}`, body);
    }

    /**
     * Sets up an audio stream and streams audio from the given source.
     *
     * Creates a new {@link AudioStream}, performs SETUP, and starts streaming
     * PCM audio via RTP to the receiver.
     *
     * @param source - Audio source to read PCM frames from.
     */
    async setupAudioStream(source: AudioSource): Promise<void> {
        this.#audioStream = new AudioStream(this);
        await this.#audioStream.setup();
        await this.#audioStream.stream(source, this.#discoveryResult.address);
    }

    /**
     * Configures a timing server for NTP-based synchronization.
     *
     * When set, SETUP requests include the timing server's port and use NTP
     * as the timing protocol instead of 'None'. Required for multi-room audio
     * synchronization.
     *
     * @param timingServer - The NTP timing server instance.
     */
    useTimingServer(timingServer: TimingServer): void {
        this.#timingServer = timingServer;
    }
}
