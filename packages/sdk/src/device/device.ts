import { EventEmitter } from 'node:events';
import type { AccessoryCredentials, DeviceIdentity, DiscoveryResult, TimingServer } from '@basmilius/apple-common';
import { getGlobalTimingServer } from '../configure';
import { ArtworkController, MediaController, MultiroomController, PlaybackController, RemoteController, StateController, VolumeController } from '../controller';
import { AirPlayManager } from '../internal';
import { type PairingOptions, PairingSession } from '../pairing';
import type { DeviceOptions } from '../types';

/**
 * Abstract base class for all Apple devices.
 * Provides shared controllers and lifecycle management.
 */
export abstract class AbstractDevice extends EventEmitter {
    readonly #airplay: AirPlayManager;
    readonly #discoveryResult: DiscoveryResult;
    readonly #identity?: Partial<DeviceIdentity>;

    readonly remote: RemoteController;
    readonly playback: PlaybackController;
    readonly state: StateController;
    readonly volume: VolumeController;
    readonly artwork: ArtworkController;
    readonly media: MediaController;
    readonly multiroom: MultiroomController;

    constructor(options: DeviceOptions) {
        super();

        if (!options.airplay && !options.address) {
            throw new Error('Either `airplay` discovery result or `address` must be provided.');
        }

        this.#discoveryResult = options.airplay ?? {
            id: options.address!,
            txt: {},
            fqdn: options.address!,
            address: options.address!,
            modelName: '',
            familyName: null,
            service: {port: 7000, protocol: 'tcp' as const, type: '_airplay._tcp'},
            packet: null as any
        } as DiscoveryResult;

        this.#identity = options.identity;

        this.#airplay = new AirPlayManager(this.#discoveryResult, this.#identity);

        const timingServer = options.timingServer ?? getGlobalTimingServer();

        if (timingServer) {
            this.#airplay.timingServer = timingServer;
        }

        // Create shared controllers.
        this.remote = new RemoteController(this.#airplay);
        this.playback = new PlaybackController(this.#airplay);
        this.state = new StateController(this.#airplay);
        this.volume = new VolumeController(this.#airplay);
        this.artwork = new ArtworkController(this.#airplay);
        this.media = new MediaController(this.#airplay);
        this.multiroom = new MultiroomController(this.#airplay);

        // Wire up AirPlay events.
        this.#airplay.on('connected', () => this.onAirPlayConnected());
        this.#airplay.on('disconnected', (unexpected) => this.onAirPlayDisconnected(unexpected));
    }

    /**
     * The unique identifier of the device (from mDNS discovery).
     */
    get id(): string {
        return this.#discoveryResult.id;
    }

    /**
     * The human-readable name of the device.
     */
    get name(): string {
        return this.#discoveryResult.familyName ?? this.#discoveryResult.fqdn;
    }

    /**
     * The IP address of the device.
     */
    get address(): string {
        return this.#discoveryResult.address;
    }

    /**
     * Whether the device is currently connected.
     */
    get isConnected(): boolean {
        return this.#airplay.isConnected;
    }

    /**
     * Raw receiver info from the AirPlay /info endpoint.
     */
    get receiverInfo(): Record<string, any> | undefined {
        return this.#airplay.receiverInfo;
    }

    /**
     * AirPlay device capabilities (features supported by the receiver).
     */
    get capabilities() {
        return this.#airplay.capabilities;
    }

    /**
     * Updates the discovery result (e.g. when the device's IP address changes).
     */
    set discoveryResult(result: DiscoveryResult) {
        this.#airplay.discoveryResult = result;
    }

    /**
     * Updates the timing server for multi-room audio sync.
     */
    set timingServer(server: TimingServer | undefined) {
        this.#airplay.timingServer = server;
    }

    /**
     * The underlying AirPlay protocol manager.
     * Use this for low-level protocol access, raw state events, or features
     * not covered by the high-level controllers.
     */
    get airplay(): AirPlayManager {
        return this.#airplay;
    }

    /**
     * Creates a step-based pairing session for interactive PIN entry flows.
     *
     * ```ts
     * const session = tv.createPairingSession();
     * await session.start();           // Connects and triggers PIN dialog
     * await session.pin('1234');        // Submits PIN, executes M1-M6
     * const creds = await session.end(); // Returns credentials, cleans up
     * ```
     */
    createPairingSession(): PairingSession {
        return new PairingSession(this.#discoveryResult, this.#identity);
    }

    /**
     * Pairs with the device using a callback-based PIN flow.
     * Convenience method that wraps createPairingSession().
     *
     * @param options - Pairing options with onPinRequired callback.
     * @returns Long-term credentials for future connections.
     */
    async pair(options: PairingOptions): Promise<AccessoryCredentials> {
        const session = this.createPairingSession();
        await session.start();
        const pin = await options.onPinRequired();
        await session.pin(pin);
        return await session.end();
    }

    /**
     * Connects to the device.
     *
     * @param credentials - Pairing credentials. Required for Apple TV, ignored for HomePod.
     */
    abstract connect(credentials?: AccessoryCredentials): Promise<void>;

    /**
     * Disconnects from the device.
     */
    disconnect(): void {
        this.state.unsubscribe();
        this.#airplay.disconnectSafely();
    }

    /**
     * Called when AirPlay connects successfully. Override for additional setup.
     */
    protected onAirPlayConnected(): void {
        this.state.subscribe();
    }

    /**
     * Called when AirPlay disconnects. Override for additional cleanup.
     */
    protected onAirPlayDisconnected(unexpected: boolean): void {
        this.state.unsubscribe();
    }
}
