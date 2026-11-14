import { EventEmitter } from 'node:events';
import { format } from 'node:util';
import { type AirPlaySession, type AirPlayTarget, connect as connectAirPlay, parseFeatures } from '@corewire/airplay';
import { MediaRemote, MediaRemoteState } from '@corewire/airplay/mrp';
import { type CompanionLinkSession, CompanionLinkState, connect as connectCompanionLink } from '@corewire/companion-link';
import { ConnectionClosedError, CredentialsError, type DebugGroup, DiscoveryError, type LogSink } from '@corewire/core';
import { type CloseReason, Context } from '@corewire/core/transport';
import { ArtworkController, type ArtworkControl } from '../artwork/artwork';
import { accessoryCredentialsOf, type Credentials } from '../credentials/credentials';
import { lookupDeviceModel, type DeviceModel } from '../deviceModel';
import { Link } from '../lifecycle/link';
import { Resolver } from '../lifecycle/resolve';
import type { Schedule } from '../lifecycle/schedule';
import { deriveState, sameStatus, type StatusLink } from '../lifecycle/status';
import { acquireTimingServer, releaseTimingServer } from '../lifecycle/timing';
import { MediaController, type MediaControl } from '../media/media';
import { MultiroomController, type MultiroomControl } from '../multiroom/multiroom';
import { NowPlayingController, type NowPlayingControl } from '../nowPlaying/nowPlaying';
import { PlaybackController, type PlaybackControl } from '../playback/playback';
import { RemoteController, type RemoteControl } from '../remote/remote';
import type { AppleTVCapability, Capability, DeviceOptions, DeviceSessions, DeviceTarget, LogLevel, ProtocolStatus, Status, StatusReason } from '../types';
import { VolumeController, type VolumeControl } from '../volume/volume';

const DEFAULT_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn'];

/** Options both device classes accept; only an Apple TV exposes the Companion Link ones. */
export type BaseOptions = DeviceOptions & {
    readonly credentials?: Credentials;
    readonly activeUserAccount?: string;
};

type AirPlayLink = {
    readonly session: AirPlaySession;
    readonly remote: MediaRemote;
};

type EventMap = {
    status: [status: Status];
};

const NO_COMPANION_LINK: ProtocolStatus = {state: 'off', attempt: 0, phase: null, nextAttemptAt: null, error: null};

function toAirPlayTarget(target: DeviceTarget): AirPlayTarget {
    const features = target.txt?.features ?? target.txt?.ft;
    let parsed: bigint | undefined;

    try {
        parsed = features ? parseFeatures(features) : undefined;
    } catch {
        parsed = undefined;
    }

    return {address: target.address, port: target.port, id: target.id, txt: target.txt, features: parsed};
}

function watch(emitter: {readonly closeReason: CloseReason | undefined; on(event: 'closed', listener: (reason: CloseReason, error?: Error) => void): unknown}, onClosed: (reason: CloseReason, error?: Error) => void): void {
    if (emitter.closeReason) {
        onClosed(emitter.closeReason);

        return;
    }

    emitter.on('closed', onClosed);
}

/**
 * An Apple TV or HomePod. {@link connect} keeps it connected until {@link disconnect}: it retries
 * after a drop or a failed attempt, looks the device up again when its address changes, and
 * reports all of it with one `status` event.
 */
export abstract class AppleDevice<TCapability extends AppleTVCapability = Capability> extends EventEmitter<EventMap> {
    get address(): string {
        return this.#resolver.target.address;
    }

    get id(): string {
        return this.#id;
    }

    get model(): DeviceModel {
        return lookupDeviceModel(this.modelName);
    }

    /** The model identifier, e.g. `AudioAccessory5,1`; empty until known. */
    get modelName(): string {
        return this.#resolver.target.txt?.model ?? this.#info?.model ?? '';
    }

    get name(): string {
        return this.#resolver.target.txt?.name ?? this.#info?.name ?? this.#id;
    }

    /** The protocol sessions in use now, for diagnostics and experiments. */
    get sessions(): DeviceSessions {
        return {
            airplay: this.#airplay.session?.session,
            mediaRemote: this.#airplay.session?.remote,
            companionLink: this.#companionLink?.session
        };
    }

    get status(): Status {
        return this.#status;
    }

    readonly artwork: ArtworkControl;
    readonly media: MediaControl;
    readonly multiroom: MultiroomControl;
    readonly nowPlaying: NowPlayingControl;
    readonly playback: PlaybackControl;
    readonly remote: RemoteControl;
    readonly volume: VolumeControl;

    /** The MRP model; it outlives the sessions and is cleared when a new one starts or on disconnect. */
    protected readonly mediaRemoteState: MediaRemoteState = new MediaRemoteState();

    /** The Companion Link model; it outlives the sessions and is cleared when a new one starts or on disconnect. */
    protected readonly companionLinkState: CompanionLinkState = new CompanionLinkState();

    readonly #airplay: Link<AirPlayLink>;
    readonly #companionLink?: Link<CompanionLinkSession>;
    readonly #context: Context;
    readonly #id: string;
    readonly #logSink?: LogSink;
    readonly #multiroom: MultiroomController;
    readonly #nowPlaying: NowPlayingController;
    readonly #options: BaseOptions;
    readonly #resolver: Resolver;
    readonly #volume: VolumeController;

    /**
     * Companion Link on an Apple TV without credentials: off for good, so the device is `degraded`.
     * One error instance, so equal statuses compare equal.
     */
    readonly #withoutCredentials: StatusLink = {
        status: {...NO_COMPANION_LINK, error: new CredentialsError('Companion Link needs credentials from a PIN pairing.')},
        hasConnected: false
    };

    /** The address AirPlay moved to; Companion Link retries at once there instead of waiting for its schedule. */
    #addressChanged: boolean = false;

    #companionLinkStarted: boolean = false;
    #connecting?: Promise<void>;
    #info?: {readonly name?: string; readonly model?: string};

    /** Set while {@link disconnect} stops the links, so their changes add up to one status. */
    #quiet: boolean = false;

    #running: boolean = false;
    #status: Status;

    protected constructor(target: DeviceTarget, options: BaseOptions, schedule: Schedule, companionLink: boolean) {
        super();

        const levels = options.logLevels ?? DEFAULT_LOG_LEVELS;

        this.#id = target.id ?? target.address;
        this.#options = options;
        this.#logSink = options.log ? (group, args) => this.#log(levels, group, args) : undefined;
        this.#context = new Context(this.#id, options.identity, this.#logSink);
        this.#resolver = new Resolver(target, this.#context.logger, options.resolve);

        this.#airplay = new Link({
            schedule,
            open: (signal, first) => this.#openAirPlay(signal, first),
            watch: (link, onClosed) => watch(link.session, onClosed),
            close: link => link.session.close()
        });

        this.#airplay.on('change', reason => this.#onAirPlayChange(reason));

        if (companionLink) {
            this.#companionLink = new Link({
                schedule,
                open: signal => this.#openCompanionLink(signal),
                watch: (session, onClosed) => watch(session, onClosed),
                close: session => session.close()
            });

            this.#companionLink.on('change', reason => this.#update(reason, this.#companionLink.status.error));
        }

        const mediaRemote = (): MediaRemote | undefined => this.#airplay.session?.remote;
        const companionLinkSession = (): CompanionLinkSession | undefined => this.#companionLink?.session;

        this.#multiroom = new MultiroomController(this.mediaRemoteState, mediaRemote);
        this.#nowPlaying = new NowPlayingController(this.mediaRemoteState, mediaRemote);
        this.#volume = new VolumeController(this.mediaRemoteState, mediaRemote);

        this.artwork = new ArtworkController(mediaRemote);
        this.media = new MediaController(() => this.#airplay.session?.session);
        this.multiroom = this.#multiroom;
        this.nowPlaying = this.#nowPlaying;
        this.playback = new PlaybackController(mediaRemote);
        this.remote = new RemoteController(mediaRemote, companionLinkSession);
        this.volume = this.#volume;

        this.#status = this.#buildStatus('requested', null);
    }

    /**
     * Keeps the device connected until {@link disconnect}. Resolves the first time it is connected or
     * degraded. Rejects when the first attempt and the quick retries all failed; the device keeps
     * trying on the slow schedule after that. A call while connected resolves at once; a call while
     * `offline` runs the next scheduled attempt now.
     */
    connect(): Promise<void> {
        if (this.#connecting) {
            return this.#connecting;
        }

        if (this.#status.state === 'connected' || this.#status.state === 'degraded') {
            return Promise.resolve();
        }

        const connecting = new Promise<void>((resolve, reject) => {
            const check = (status: Status): void => {
                const airplay = status.airplay;

                if (status.state === 'connected' || status.state === 'degraded') {
                    this.off('status', check);
                    resolve();
                } else if (status.state === 'disconnected') {
                    this.off('status', check);
                    reject(new ConnectionClosedError('The device was disconnected before it connected.'));
                } else if (airplay.state === 'waiting' && airplay.phase !== 'quick') {
                    this.off('status', check);
                    reject(airplay.error ?? new ConnectionClosedError('The device did not connect.'));
                }
            };

            this.on('status', check);
        });

        this.#connecting = connecting;
        void connecting.then(() => this.#clearConnecting(connecting), () => this.#clearConnecting(connecting));

        if (!this.#running) {
            this.#running = true;
            this.#airplay.start();
        } else if (this.#status.state === 'offline') {
            this.#airplay.retryNow();
        }

        return connecting;
    }

    /**
     * Stops every retry, ends the media sessions and every protocol session. Idempotent. The
     * device forgets what it announced and reports `disconnected` at once, so a `connect()` right
     * after, even without awaiting this, starts fresh; the promise settles once the sessions closed.
     */
    async disconnect(): Promise<void> {
        this.#running = false;
        this.#companionLinkStarted = false;
        this.#addressChanged = false;
        this.#quiet = true;

        let stopping: Promise<unknown>;

        try {
            // Stopping the links ends the AirPlay session and the Companion Link state feed at
            // once, so no model event fires after the reset below.
            stopping = Promise.all([
                this.#airplay.stop(),
                this.#companionLink?.stop()
            ]);
        } finally {
            this.#quiet = false;
        }

        // A disconnect is a fresh start: the next connect announces everything as a new device does.
        // A drop keeps the announced values, so a recovery stays silent about what did not change.
        this.#nowPlaying.stop();
        this.reset();

        releaseTimingServer(this);

        // The pending connect rejects with this status; a connect after it starts anew.
        this.#connecting = undefined;
        this.#update('requested', null);

        await stopping;
    }

    /** Whether the capability works now. A call that cannot work throws an `UnavailableError`. */
    supports(capability: TCapability): boolean {
        const airplay = this.#airplay.session;
        const companionLink = this.#companionLink?.session;

        switch (capability) {
            case 'playUrl':
                return !!airplay?.session.supportsUrlPlayback;

            case 'text':
                return !!companionLink || !!airplay;

            case 'apps':
            case 'accounts':
            case 'system':
            case 'touch':
                return !!companionLink;

            default:
                return !!airplay;
        }
    }

    /**
     * Forgets what the capabilities announced and clears both models, as for a new device. Runs
     * at the start of {@link disconnect}; a subclass adds its own capabilities.
     */
    protected reset(): void {
        this.#multiroom.reset();
        this.#nowPlaying.reset();
        this.#volume.reset();
        this.mediaRemoteState.clear();
        this.companionLinkState.clear();
    }

    #buildStatus(reason: StatusReason, error: Error | null): Status {
        const companionLink = this.#companionLink && !this.#options.credentials ? this.#withoutCredentials : this.#companionLink;

        return {
            state: deriveState(this.#running, this.#airplay, companionLink),
            reason,
            error,
            airplay: this.#airplay.status,
            companionLink: companionLink?.status
        };
    }

    #clearConnecting(connecting: Promise<void>): void {
        if (this.#connecting === connecting) {
            this.#connecting = undefined;
        }
    }

    /** Calls every `status` listener, also when an earlier one throws, so a consumer cannot stall the lifecycle. */
    #emitStatus(status: Status): void {
        for (const listener of this.rawListeners('status')) {
            try {
                (listener as (status: Status) => void).call(this, status);
            } catch (err) {
                this.#context.logger.error('[device]', 'A status listener threw.', err);
            }
        }
    }

    #log(levels: readonly LogLevel[], group: DebugGroup, args: readonly unknown[]): void {
        if (!levels.includes(group)) {
            return;
        }

        this.#options.log({level: group, device: this.#id, message: format(...args), args, timestamp: Date.now()});
    }

    /** Companion Link starts once the first AirPlay attempt settled, so the connect order on the wire stays AirPlay first. */
    #onAirPlayChange(reason: StatusReason): void {
        const state = this.#airplay.state;

        if (this.#running && this.#companionLink && this.#options.credentials && !this.#companionLinkStarted && (state === 'connected' || state === 'waiting')) {
            this.#companionLinkStarted = true;
            this.#companionLink.start();
        }

        if (state === 'connected') {
            const info = this.#airplay.session.session.info;

            this.#info = {name: info?.name, model: info?.model};

            if (this.#addressChanged) {
                this.#addressChanged = false;
                this.#companionLink?.retryNow();
            }
        }

        this.#update(reason, this.#airplay.status.error);
    }

    async #openAirPlay(signal: AbortSignal, first: boolean): Promise<AirPlayLink> {
        if (!first || this.#resolver.target.port === undefined) {
            const address = this.#resolver.target.address;

            await this.#resolver.refreshAirPlay(signal);

            if (this.#resolver.target.address !== address) {
                this.#addressChanged = true;
            }
        }

        const timing = this.#options.timing === false
            ? undefined
            : this.#options.timing ?? await acquireTimingServer(this, this.#logSink);

        if (signal.aborted) {
            // A disconnect released the server while this attempt waited for it.
            if (!this.#running) {
                releaseTimingServer(this);
            }

            throw new ConnectionClosedError('AirPlay setup was interrupted.');
        }

        const session = await connectAirPlay(toAirPlayTarget(this.#resolver.target), {
            credentials: this.#options.credentials ? accessoryCredentialsOf(this.#options.credentials) : undefined,
            context: this.#context,
            timing,
            signal
        });

        this.#nowPlaying.hold();
        this.mediaRemoteState.clear();

        const remote = await MediaRemote.open(session, {state: this.mediaRemoteState});

        // A disconnect that came in while the remote opened already ended the session through the
        // signal, and must not leave a restore timer behind.
        if (signal.aborted) {
            throw new ConnectionClosedError('AirPlay setup was interrupted.');
        }

        this.#nowPlaying.resume();

        return {session, remote};
    }

    async #openCompanionLink(signal: AbortSignal): Promise<CompanionLinkSession> {
        await this.#resolver.refreshCompanionLink();

        const record = this.#resolver.companionLink;
        const target = this.#resolver.target;

        if (!record) {
            throw new DiscoveryError(`Companion Link did not answer at ${target.address}.`);
        }

        if (signal.aborted) {
            throw new ConnectionClosedError('Companion Link setup was interrupted.');
        }

        this.companionLinkState.clear();

        return await connectCompanionLink({address: target.address, port: record.port, id: target.id, txt: record.txt}, {
            credentials: accessoryCredentialsOf(this.#options.credentials),
            context: this.#context,
            activeUserAccount: this.#options.activeUserAccount,
            state: this.companionLinkState,
            signal
        });
    }

    #update(reason: StatusReason, error: Error | null): void {
        if (this.#quiet) {
            return;
        }

        const status = this.#buildStatus(reason, reason === 'established' || reason === 'requested' ? null : error);

        if (sameStatus(this.#status, status)) {
            return;
        }

        this.#status = status;
        this.#emitStatus(status);
    }
}
