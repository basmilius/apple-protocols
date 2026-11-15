import { AccountsController, type AccountsControl } from '../accounts/accounts';
import { AppsController, type AppsControl } from '../apps/apps';
import type { Credentials } from '../credentials/credentials';
import { Pairing, type PairOptions } from '../pairing/pairing';
import { PowerController, type PowerControl } from '../power/power';
import { SystemController, type SystemControl } from '../system/system';
import { TextController, type TextControl } from '../text/text';
import { TouchController, type TouchControl } from '../touch/touch';
import type { AppleTVCapability, DeviceOptions, DeviceTarget } from '../types';
import { AppleDevice } from './device';

export type AppleTVOptions = DeviceOptions & {
    /** The credentials from a PIN pairing. Without them AirPlay pairs transiently and Companion Link stays off. */
    readonly credentials?: Credentials;

    /** The iCloud alternate DSID that Companion Link announces during its startup. */
    readonly activeUserAccount?: string;
};

/**
 * An Apple TV: AirPlay for remote control, now playing, volume and media, Companion Link for apps,
 * accounts, power state, text input and touch. Companion Link attaches by itself once it answers;
 * until then the device is `degraded`.
 */
export class AppleTV extends AppleDevice<AppleTVCapability> {
    readonly accounts: AccountsControl;
    readonly apps: AppsControl;
    readonly power: PowerControl;
    readonly system: SystemControl;
    readonly text: TextControl;
    readonly touch: TouchControl;

    readonly #power: PowerController;

    constructor(target: DeviceTarget, options: AppleTVOptions = {}) {
        super(target, options, 'appleTv', true);

        const companionLink = () => this.sessions.companionLink;
        const mediaRemote = () => this.sessions.mediaRemote;

        this.#power = new PowerController(this.companionLinkState, mediaRemote);

        this.accounts = new AccountsController(companionLink);
        this.apps = new AppsController(companionLink);
        this.power = this.#power;
        this.system = new SystemController(companionLink);
        this.text = new TextController(this.mediaRemoteState, mediaRemote, this.companionLinkState, companionLink);
        this.touch = new TouchController(companionLink);
    }

    /** Starts a PIN pairing; the PIN shows on screen once this resolves. */
    static async pair(target: DeviceTarget, options: PairOptions = {}): Promise<Pairing> {
        return await Pairing.start(target, options);
    }

    protected override reset(): void {
        super.reset();

        this.#power.reset();
    }
}
