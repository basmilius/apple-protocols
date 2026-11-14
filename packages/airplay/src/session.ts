import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ConnectionClosedError, getMacAddress, PlaybackError, randomInt64, SetupError, TimeoutError } from '@corewire/core';
import { Plist } from '@corewire/core/encoding';
import type { AccessoryKeys } from '@corewire/core/pairing';
import { type CloseReason, Context } from '@corewire/core/transport';
import { AirPlayFeatureFlags, hasFeatureFlag, SENDER_FEATURES_AUDIO, SENDER_FEATURES_REMOTE_CONTROL } from './airplayFeatures';
import { AudioPlayback } from './audio/playback';
import type { AudioSource } from './audio/source';
import { AudioSourceSession } from './audio/sourceSession';
import { AudioStream, type AudioStreamOptions } from './audio/stream';
import { ControlChannel } from './channels/control';
import { DataChannel } from './channels/data';
import { EventChannel } from './channels/event';
import { DEFAULT_PORT, FEEDBACK_INTERVAL } from './const';
import { encodeFeatures } from './features';
import { fetchInfo, type ReceiverInfo } from './info';
import * as Proto from './mrp/proto';
import { transientPairing, verifyPairing } from './pairing';
import { UrlPlayback } from './playback/playback';
import { type PtpMaster, selectTimingStrategy } from './timing';
import type { AirPlayTarget, ConnectOptions, PlayUrlOptions, RemoteControl, RemoteControlOptions, SessionCloseReason, StreamAudioOptions } from './types';

/**
 * How long the keepalive may go without a successful `/feedback` before the receiver counts as gone.
 * A receiver only flags an inactive client after tens of seconds, and a busy hub can miss a few ticks.
 */
const KEEPALIVE_DEADLINE = 30000;

/** A fresh audio session starts silent, so it gets an audible volume. */
const DEFAULT_VOLUME_DB = -20;

/** Client type of the MRP data stream in its SETUP. */
const DATA_CLIENT_TYPE_UUID = '1910A70F-DBC0-4242-AF95-115DB30604E1';

/** A dedicated audio connection, after the audio session SETUP, RECORD and volume, with its stream not set up yet. */
export type AudioLink = {
    readonly session: AirPlaySession;
    readonly stream: AudioStream;
};

type AudioLinkOptions = StreamAudioOptions & AudioStreamOptions;

/** Package-internal: how the multiplexer reaches into a session without a public method for it. */
const audioLinks = new WeakMap<AirPlaySession, (options: AudioLinkOptions) => Promise<AudioLink>>();

/** Opens an audio connection for a caller that drives the {@link AudioStream} itself, such as the multiplexer. */
export function openAudioLink(session: AirPlaySession, options: AudioLinkOptions): Promise<AudioLink> {
    return audioLinks.get(session)(options);
}

type EventMap = {
    closed: [reason: SessionCloseReason, error?: Error];
};

type ChannelName = 'control' | 'data' | 'event';

type SessionParts = {
    readonly target: AirPlayTarget;
    readonly options: ConnectOptions;
    readonly context: Context;
    readonly control: ControlChannel;
    readonly keys: AccessoryKeys;
    readonly info: ReceiverInfo;
    readonly ptpMaster?: PtpMaster;
};

/**
 * Connects to an AirPlay receiver and returns a ready session: TCP, `GET /info`, pair-verify with
 * the credentials or a transient pairing without, then encryption of the control channel.
 *
 * @throws {ConnectionClosedError} When the signal aborts during the handshake.
 * @throws {PairingError} When pairing fails.
 */
export async function connect(target: AirPlayTarget, options: ConnectOptions = {}): Promise<AirPlaySession> {
    return await establish(target, options);
}

async function establish(target: AirPlayTarget, options: ConnectOptions, ptpMaster?: PtpMaster): Promise<AirPlaySession> {
    const signal = options.signal;

    if (signal?.aborted) {
        throw new ConnectionClosedError('AirPlay setup was interrupted.');
    }

    const context = options.context ?? new Context(target.id ?? target.address, options.identity);
    const control = new ControlChannel(context, target.address, target.port ?? DEFAULT_PORT);
    const interrupt = (): void => control.destroy();

    signal?.addEventListener('abort', interrupt, {once: true});

    try {
        await control.connect();

        const info = await fetchInfo(control, context);
        const keys = options.credentials
            ? await verifyPairing(control, context, options.credentials)
            : await transientPairing(control, context);

        if (signal?.aborted || !control.isConnected) {
            throw new ConnectionClosedError('AirPlay setup was interrupted.');
        }

        control.enableEncryption(keys.accessoryToControllerKey, keys.controllerToAccessoryKey);

        return new AirPlaySession({target, options, context, control, keys, info, ptpMaster});
    } catch (err) {
        control.destroy();

        throw signal?.aborted ? new ConnectionClosedError('AirPlay setup was interrupted.') : err;
    } finally {
        signal?.removeEventListener('abort', interrupt);
    }
}

/**
 * One authenticated AirPlay connection. It lives once: it ends exactly once, with a reason, and
 * then its {@link signal} aborts and every channel, timer and pending request on it goes too.
 * Remote control runs on the session itself; URL playback and audio streams each get a dedicated
 * connection, because the receiver wants them apart, and end with the session.
 */
export class AirPlaySession extends EventEmitter<EventMap> {
    /** Why the session ended, or undefined while it is open. */
    get closeReason(): SessionCloseReason | undefined {
        return this.#closeReason;
    }

    get context(): Context {
        return this.#context;
    }

    /** The RTSP control channel, encrypted. */
    get control(): ControlChannel {
        return this.#control;
    }

    /** The feature mask of the receiver from `/info`. */
    get features(): bigint {
        return this.#info.features;
    }

    /** The `/info` plist; empty when the receiver answered with another status than 200. */
    get info(): Record<string, any> {
        return this.#info.info;
    }

    get isOpen(): boolean {
        return !this.signal.aborted;
    }

    /** Our pairing identifier, from the credentials or the transient pairing. */
    get pairingId(): Buffer {
        return this.#keys.pairingId;
    }

    /** The remote control channels once {@link openRemoteControl} succeeded. */
    get remoteControl(): RemoteControl | undefined {
        return this.#remote;
    }

    /** Identifies the session in SETUP bodies; uppercase. */
    get sessionUUID(): string {
        return this.#sessionUUID;
    }

    /** Aborts with a {@link ConnectionClosedError} when the session ends. */
    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    /** Whether the receiver fetches and plays a URL itself. A HomePod advertises no video feature and needs an audio stream. */
    get supportsUrlPlayback(): boolean {
        return this.hasFeature(AirPlayFeatureFlags.SupportsAirPlayVideoV1)
            || this.hasFeature(AirPlayFeatureFlags.SupportsAirPlayVideoV2)
            || this.hasFeature(AirPlayFeatureFlags.SupportsAirPlayVideoPlayQueue);
    }

    get target(): AirPlayTarget {
        return this.#target;
    }

    readonly #context: Context;
    readonly #control: ControlChannel;
    readonly #controller: AbortController = new AbortController();
    readonly #keys: AccessoryKeys;
    readonly #options: ConnectOptions;
    readonly #ptpMaster?: PtpMaster;
    readonly #sessionUUID: string = randomUUID().toUpperCase();
    readonly #target: AirPlayTarget;
    #closeReason?: SessionCloseReason;
    #info: ReceiverInfo;
    #keepalive?: NodeJS.Timeout;
    #remote?: RemoteControl;
    #remoteOpening: boolean = false;

    /** Use {@link connect}; a session starts from a finished handshake. */
    constructor(parts: SessionParts) {
        super();

        this.#context = parts.context;
        this.#control = parts.control;
        this.#info = parts.info;
        this.#keys = parts.keys;
        this.#options = parts.options;
        this.#ptpMaster = parts.ptpMaster;
        this.#target = parts.target;

        this.#control.on('closed', (reason, error) => this.#channelClosed('control', reason, error));

        // Errors on the control channel do not end it by themselves; a close follows when they do.
        this.#control.on('error', (error: Error) => this.#context.logger.error('AirPlay error', error));

        parts.options.signal?.addEventListener('abort', () => this.#end('local'), {once: true, signal: this.signal});

        audioLinks.set(this, options => this.#openAudioLink(options));
    }

    hasFeature(feature: bigint): boolean {
        return hasFeatureFlag(this.#info.features, feature);
    }

    /** Ends the session and every connection that hangs off it, without TEARDOWN. */
    async close(): Promise<void> {
        this.#end('local');
    }

    /**
     * Opens remote control: the SETUP with the remote control features, the event channel and
     * RECORD, the SETUP of the MRP data channel and its connection, then the keepalive. The MRP
     * startup on the data channel is up to the caller, usually `MediaRemote.open()`. A failed step
     * ends the session with reason `local`.
     *
     * @throws {SetupError} When a SETUP fails.
     * @throws {ConnectionClosedError} When the session ends during setup.
     */
    async openRemoteControl(options: RemoteControlOptions = {}): Promise<RemoteControl> {
        this.#assertOpen();

        if (this.#remote || this.#remoteOpening) {
            throw new Error('Remote control is already open on this session.');
        }

        this.#remoteOpening = true;

        try {
            const body: Record<string, unknown> = {
                ...this.#setupBody(SENDER_FEATURES_REMOTE_CONTROL),
                isRemoteControlOnly: true
            };

            await this.#applyTiming(body);

            const events = await this.#connectEvents(await this.#performSetup(body, () => 'SETUP request failed.'));
            await this.#control.record(this.#path);
            this.#checkpoint();
            this.#observe('event', events);

            const data = await this.#connectData(options.subscribe);
            this.#checkpoint();
            this.#observe('data', data);
            data.on('setConnectionState', message => this.#onConnectionState(message));

            this.#startKeepalive();

            this.#remote = {data, events};

            return this.#remote;
        } catch (err) {
            this.#remoteOpening = false;

            if (this.signal.aborted) {
                throw err instanceof ConnectionClosedError ? err : new ConnectionClosedError('AirPlay setup was interrupted.');
            }

            this.#context.logger.error('[device]', 'Setup failed, cleaning up', err);
            this.#end('local');

            throw err;
        }
    }

    /**
     * Has the receiver fetch and play a URL, on a connection of its own. Resolves once playback
     * was started; the returned playback ends with the session.
     *
     * @throws {PlaybackError} When the receiver cannot play URLs or refuses this one.
     * @throws {SetupError} When the SETUP fails.
     */
    async playUrl(url: string, options: PlayUrlOptions = {}): Promise<UrlPlayback> {
        const dedicated = await this.#spawn(options.signal);

        try {
            return await dedicated.#startUrlPlayback(url, options.position ?? 0);
        } catch (err) {
            dedicated.#end('local');

            throw dedicated.#interrupted(err, 'URL playback cancelled.');
        }
    }

    /**
     * Streams PCM audio on a connection of its own. Resolves once the audio stream is set up;
     * {@link AudioPlayback.finished} settles when the source ran out and the stream is torn down.
     * The source is stopped in every case.
     *
     * @throws {SetupError} When a SETUP fails.
     */
    async streamAudio(source: AudioSource, options: StreamAudioOptions = {}): Promise<AudioPlayback> {
        const sourceSession = new AudioSourceSession(source);

        try {
            const {session, stream} = await this.#openAudioLink(options);

            try {
                await stream.setup();
                session.#checkpoint();
            } catch (err) {
                session.#end('local');

                throw session.#interrupted(err, 'Audio stream cancelled.');
            }

            return new AudioPlayback(session, stream, sourceSession);
        } catch (err) {
            await sourceSession.stop();

            throw options.signal?.aborted ? new ConnectionClosedError('Audio stream cancelled.') : err;
        }
    }

    async #openAudioLink(options: AudioLinkOptions): Promise<AudioLink> {
        const dedicated = await this.#spawn(options.signal, options.ptpMaster);

        try {
            return await dedicated.#openAudio(options.volumeDb ?? DEFAULT_VOLUME_DB, options);
        } catch (err) {
            dedicated.#end('local');

            throw dedicated.#interrupted(err, 'Audio stream cancelled.');
        }
    }

    async #openAudio(volumeDb: number, options: AudioStreamOptions): Promise<AudioLink> {
        const body: Record<string, unknown> = {
            ...this.#setupBody(SENDER_FEATURES_AUDIO),
            groupContainsGroupLeader: false,
            groupUUID: randomUUID().toUpperCase(),
            isMultiSelectAirPlay: true,
            senderSupportsRelay: false,
            statsCollectionEnabled: false,
            supportsGroupCohesion: true,
            updateSessionRequest: false
        };

        await this.#applyTiming(body);

        const events = await this.#connectEvents(await this.#performSetup(body, () => 'SETUP request failed.'));
        await this.#control.record(this.#path);
        this.#checkpoint();
        this.#observe('event', events);

        // A fresh AirPlay audio session starts silent.
        await this.#control.setParameter('volume', String(volumeDb));
        this.#checkpoint();

        this.#startKeepalive();

        const stream = new AudioStream({
            context: this.#context,
            control: this.#control,
            address: this.#target.address,
            supportedAudioFormats: this.#info.info.supportedAudioFormats
        }, options);

        this.signal.addEventListener('abort', () => stream.close(), {once: true});

        return {session: this, stream};
    }

    async #startUrlPlayback(url: string, position: number): Promise<UrlPlayback> {
        if (!this.supportsUrlPlayback) {
            throw new PlaybackError('This receiver does not support URL playback. Stream the URL as audio instead.');
        }

        const body: Record<string, unknown> = {
            ...this.#setupBody(SENDER_FEATURES_AUDIO),
            groupContainsGroupLeader: false,
            groupUUID: randomUUID(),
            isMultiSelectAirPlay: true,
            senderSupportsRelay: false,
            statsCollectionEnabled: false,
            supportsGroupCohesion: true,
            updateSessionRequest: false
        };

        await this.#applyTiming(body);

        const events = await this.#connectEvents(await this.#performSetup(body, status => `Failed to setup for playback: ${status}`));

        // Before RECORD and /play, so the session stays alive while the receiver loads.
        this.#startKeepalive();

        // A second /info, now encrypted, between SETUP and RECORD, as receivers expect for URL playback.
        try {
            this.#info = await fetchInfo(this.#control, this.#context, this.#info);
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Second GET /info failed', err);
        }

        await this.#control.record(this.#path);
        this.#checkpoint();
        this.#observe('event', events);

        try {
            return await UrlPlayback.start({
                session: this,
                context: this.#context,
                control: this.#control,
                events,
                features: this.#info.features,
                sessionUUID: this.#sessionUUID,
                senderMac: body.macAddress as string
            }, url, position);
        } catch (err) {
            this.#stopKeepalive();

            try {
                await this.#control.teardown(this.#path);
            } catch (teardownErr) {
                this.#context.logger.warn('[protocol]', 'TEARDOWN after playUrl failure also failed', teardownErr);
            }

            throw err;
        }
    }

    get #path(): string {
        return `/${this.#control.sessionId}`;
    }

    /**
     * Fills `timingProtocol` and `timingPort`: PTP when the receiver supports it and a PTP master
     * was given, NTP when a timing server was given, otherwise `None`.
     */
    async #applyTiming(body: Record<string, unknown>): Promise<void> {
        const master = this.#ptpMaster;

        if (master && selectTimingStrategy(this.#info.features) === 'PTP') {
            body.timingPort = master.state === 'idle' ? (await master.start()).eventPort : master.eventPort;
            body.timingProtocol = 'PTP';

            return;
        }

        if (this.#options.timing) {
            body.timingPort = this.#options.timing.port;
            body.timingProtocol = 'NTP';

            return;
        }

        body.timingProtocol = 'None';
    }

    #assertOpen(): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError('This AirPlay session has closed.');
        }
    }

    /** Throws when the session ended while a setup step was waiting. */
    #checkpoint(): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError('AirPlay setup was interrupted.');
        }
    }

    /**
     * A channel the session did not close itself counts as broken, also when someone destroyed it locally.
     * Once TEARDOWN went out, a receiver may drop the event or data channel before it answers on the
     * control channel, so the session then waits for that answer or its timeout.
     */
    #channelClosed(name: ChannelName, reason: CloseReason, error?: Error): void {
        const teardown = this.#control.pendingTeardown;

        if (name !== 'control' && reason === 'remote' && teardown) {
            this.#context.logger.debug('[session]', `The ${name} channel closed during TEARDOWN, ending the session once it is answered.`);
            void teardown.then(() => this.#end('local'));

            return;
        }

        if (reason === 'local') {
            this.#end('error', error ?? new ConnectionClosedError(`The ${name} channel was closed.`));

            return;
        }

        this.#end(reason, error);
    }

    async #connectData(subscribe?: (data: DataChannel) => void): Promise<DataChannel> {
        const seed = randomInt64();

        const response = await this.#control.setup(this.#path, {
            streams: [{
                controlType: 2,
                channelID: randomUUID().toUpperCase(),
                seed,
                clientUUID: randomUUID().toUpperCase(),
                type: 130,
                wantsDedicatedSocket: true,
                clientTypeUUID: DATA_CLIENT_TYPE_UUID
            }]
        });

        if (response.status !== 200) {
            this.#context.logger.error('[protocol]', 'Failed to setup data stream.', response.status, response.statusText, await response.text());
            throw new SetupError('Failed to setup data stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as {streams: {dataPort: number}[]};
        const dataPort = plist.streams[0].dataPort & 0xFFFF;

        // An abort listener added to an aborted signal never runs, so the channel would outlive the session.
        this.#checkpoint();

        this.#context.logger.net('[protocol]', `Connecting to data stream on port ${dataPort}...`);

        const data = new DataChannel(this.#context, this.#target.address, dataPort, this.#keys.sharedSecret, seed);
        this.signal.addEventListener('abort', () => data.destroy(), {once: true});

        // Before connect, so no early DEVICE_INFO or SET_STATE goes unheard.
        subscribe?.(data);

        await data.connect();

        return data;
    }

    async #connectEvents(setup: {eventPort: number}): Promise<EventChannel> {
        const eventPort = setup.eventPort & 0xFFFF;

        // An abort listener added to an aborted signal never runs, so the channel would outlive the session.
        this.#checkpoint();

        this.#context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        const events = new EventChannel(this.#context, this.#target.address, eventPort, this.#keys.sharedSecret);
        this.signal.addEventListener('abort', () => events.destroy(), {once: true});

        await events.connect();

        return events;
    }

    /** The single exit: aborts the signal (children clean up there), closes the control channel and emits `closed`. */
    #end(reason: SessionCloseReason, error?: Error): void {
        if (this.#closeReason) {
            return;
        }

        this.#closeReason = reason;
        this.#context.logger.net('[session]', `AirPlay session closed (${reason}${error ? `: ${error.message}` : ''}).`);

        this.#stopKeepalive();
        this.#controller.abort(new ConnectionClosedError(`AirPlay session closed (${reason}).`));
        this.#control.destroy();

        try {
            this.#ptpMaster?.stop();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error stopping PTP master', err);
        }

        this.emit('closed', reason, error);
    }

    /** Turns the error of a setup that the caller or the parent session interrupted into a {@link ConnectionClosedError}. */
    #interrupted(err: unknown, message: string): unknown {
        return this.#options.signal?.aborted ? new ConnectionClosedError(message) : err;
    }

    /** A channel counts once it is connected; a close or error after that ends the session. */
    #observe(name: Exclude<ChannelName, 'control'>, channel: DataChannel | EventChannel): void {
        if (!channel.isConnected) {
            throw new ConnectionClosedError('An AirPlay stream closed during setup.');
        }

        channel.on('closed', (reason, error) => this.#channelClosed(name, reason, error));
        channel.on('error', (error: Error) => {
            this.#context.logger.error('AirPlay stream error', error);
            this.#end('error', error);
        });
    }

    /**
     * The receiver answers a message it rejects with Disconnected and then ignores the session, so
     * the session has to go down with it instead of staying up in name only.
     */
    #onConnectionState(message: Proto.SetConnectionStateMessage): void {
        if (message.state !== Proto.SetConnectionStateMessage_ConnectionState.Disconnected) {
            return;
        }

        this.#context.logger.error('AirPlay session dropped by the device');
        this.#end('remote', new ConnectionClosedError('The receiver dropped the session.'));
    }

    async #performSetup(body: Record<string, unknown>, failure: (status: number) => string): Promise<{eventPort: number}> {
        const response = await this.#control.setup(this.#path, body);

        if (response.status !== 200) {
            this.#context.logger.error('[protocol]', 'Failed SETUP request.', response.status, response.statusText);
            throw new SetupError(failure(response.status));
        }

        const plist = Plist.parse(await response.arrayBuffer()) as Record<string, any>;

        if (plist.enabledFeatures != null) {
            this.#context.logger.info('[protocol]', `Receiver enabled features: 0x${BigInt(plist.enabledFeatures).toString(16)}`);
        }

        if (plist.keepAlivePort != null) {
            this.#context.logger.info('[protocol]', `Receiver keep-alive port: ${plist.keepAlivePort}`);
        }

        return plist as {eventPort: number};
    }

    /** The common SETUP body: identity, features, our MAC and the session UUID. */
    #setupBody(features: bigint): Record<string, unknown> {
        const identity = this.#context.identity;

        return {
            deviceID: this.#keys.pairingId.toString(),
            ...encodeFeatures(features),
            macAddress: getMacAddress().toUpperCase(),
            model: identity.model,
            name: identity.name,
            osBuildVersion: identity.osBuildVersion,
            osName: identity.osName,
            osVersion: identity.osVersion,
            sourceVersion: this.#info.sourceVersion,
            sessionUUID: this.#sessionUUID,
            sessionCorrelationUUID: this.#sessionUUID.toUpperCase()
        };
    }

    /** A new connection to the same receiver with the same credentials and timing, ending with this session. */
    async #spawn(signal?: AbortSignal, ptpMaster?: PtpMaster): Promise<AirPlaySession> {
        this.#assertOpen();

        return await establish(this.#target, {
            ...this.#options,
            context: this.#context,
            signal: signal ? AbortSignal.any([this.signal, signal]) : this.signal
        }, ptpMaster);
    }

    /**
     * `POST /feedback` every two seconds. A tick that finds no success within {@link KEEPALIVE_DEADLINE}
     * ends the session with `timeout`.
     */
    #startKeepalive(): void {
        if (this.#keepalive || this.signal.aborted) {
            return;
        }

        let lastSuccess = Date.now();
        let lastError: Error | undefined;

        this.#keepalive = setInterval(async () => {
            if (Date.now() - lastSuccess >= KEEPALIVE_DEADLINE) {
                this.#end('timeout', lastError ?? new TimeoutError(`No successful feedback for ${KEEPALIVE_DEADLINE} ms.`));

                return;
            }

            try {
                await this.#control.feedback();
                lastSuccess = Date.now();
                lastError = undefined;
            } catch (err) {
                if (this.signal.aborted) {
                    return;
                }

                lastError = err instanceof Error ? err : new Error(String(err));
                this.#context.logger.warn('[protocol]', `Feedback failed (${Math.round((Date.now() - lastSuccess) / 1000)} s since the last success).`, err);
            }
        }, FEEDBACK_INTERVAL);
    }

    #stopKeepalive(): void {
        clearInterval(this.#keepalive);
        this.#keepalive = undefined;
    }
}
