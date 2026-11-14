import { AccountsControl } from '../accounts/accounts';
import { AppsControl } from '../apps/apps';
import type { Credentials } from '../credentials/credentials';
import { Pairing, type PairOptions } from '../pairing/pairing';
import { PowerControl } from '../power/power';
import { SystemControl } from '../system/system';
import { TextControl } from '../text/text';
import { TouchControl } from '../touch/touch';
import type { AppleTVCapability, DeviceOptions, DeviceTarget } from '../types';
import { AppleDevice } from './device';

export type AppleTVOptions = DeviceOptions & {
    /** From a PIN pairing. Without them AirPlay pairs transiently and Companion Link stays off. */
    readonly credentials?: Credentials;

    /** iCloud alternate DSID announced to Companion Link during its startup. */
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

    constructor(target: DeviceTarget, options: AppleTVOptions = {}) {
        super(target, options, 'appleTv', true);

        const companionLink = () => this.sessions.companionLink;
        const mediaRemote = () => this.sessions.mediaRemote;

        this.accounts = new AccountsControl(companionLink);
        this.apps = new AppsControl(companionLink);
        this.power = new PowerControl(this.companionLinkState, mediaRemote);
        this.system = new SystemControl(companionLink);
        this.text = new TextControl(this.mediaRemoteState, mediaRemote, this.companionLinkState, companionLink);
        this.touch = new TouchControl(companionLink);
    }

    async disconnect(): Promise<void> {
        await super.disconnect();

        this.power.reset();
    }

    /** Starts a PIN pairing; the PIN shows on screen once this resolves. */
    static async pair(target: DeviceTarget, options: PairOptions = {}): Promise<Pairing> {
        return await Pairing.start(target, options);
    }
}
