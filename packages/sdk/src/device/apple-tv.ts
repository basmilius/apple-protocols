import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';
import { CompanionLinkManager } from '../internal/companion-link-manager';
import { AppsController } from '../controller/apps';
import { KeyboardController } from '../controller/keyboard';
import { PowerController } from '../controller/power';
import { SystemController } from '../controller/system';
import type { DeviceOptions } from '../types';
import { AbstractDevice } from './device';

/**
 * Options specific to Apple TV devices.
 */
export type AppleTVOptions = DeviceOptions & {
    /** Pre-discovered Companion Link service result. */
    readonly companionLink?: DiscoveryResult;
};

/**
 * High-level Apple TV device combining AirPlay and Companion Link protocols.
 * Provides remote control, media playback, app launching, keyboard input,
 * power management, and system settings.
 *
 * ```ts
 * const tv = new AppleTV({ airplay: result, companionLink: clResult });
 *
 * // First time — pair
 * const session = tv.createPairingSession();
 * await session.start();
 * await session.pin('1234');
 * const credentials = await session.end();
 *
 * // Connect with credentials
 * await tv.connect(credentials);
 * await tv.playback.play();
 * ```
 */
export class AppleTV extends AbstractDevice {
    readonly #companionLink: CompanionLinkManager | undefined;

    readonly apps: AppsController | undefined;
    readonly keyboard: KeyboardController;
    readonly power: PowerController | undefined;
    readonly system: SystemController | undefined;

    constructor(options: AppleTVOptions) {
        super(options);

        this.keyboard = new KeyboardController(this._airplay);

        if (options.companionLink) {
            this.#companionLink = new CompanionLinkManager(options.companionLink);
            this.apps = new AppsController(this.#companionLink);
            this.power = new PowerController(this._airplay, this.#companionLink);
            this.system = new SystemController(this.#companionLink);

            // Forward Companion Link events.
            this.#companionLink.on('attentionStateChanged', (state) => {
                this.emit('power', state);
            });

            this.#companionLink.on('textInputChanged', (state) => {
                this.emit('textInput', state);
            });
        }
    }

    get isConnected(): boolean {
        const airplayConnected = this._airplay.isConnected;
        const companionLinkConnected = this.#companionLink?.isConnected ?? true;
        return airplayConnected && companionLinkConnected;
    }

    /**
     * Connects to the Apple TV using AirPlay and (optionally) Companion Link.
     *
     * @param credentials - Pairing credentials from pair-setup.
     */
    async connect(credentials: AccessoryCredentials): Promise<void> {
        this._airplay.setCredentials(credentials);
        await this._airplay.connect();

        if (this.#companionLink) {
            try {
                await this.#companionLink.setCredentials(credentials);
                await this.#companionLink.connect();
            } catch {
                // Companion Link is optional — the device is still usable via AirPlay.
            }
        }
    }

    disconnect(): void {
        super.disconnect();
        this.#companionLink?.disconnectSafely();
    }

    protected onAirPlayConnected(): void {
        super.onAirPlayConnected();
        this.emit('connected');
    }

    protected onAirPlayDisconnected(unexpected: boolean): void {
        super.onAirPlayDisconnected(unexpected);
        this.emit('disconnected', unexpected);
    }
}
