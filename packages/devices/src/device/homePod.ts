import type { DeviceOptions, DeviceTarget, HomePodCapability } from '../types';
import { AppleDevice } from './device';

/**
 * A HomePod or HomePod mini (see `model`), over AirPlay with transient pairing. It cannot fetch a
 * URL itself; stream the audio instead.
 */
export class HomePod extends AppleDevice<HomePodCapability> {
    constructor(target: DeviceTarget, options: DeviceOptions = {}) {
        super(target, options, 'homePod', false);
    }
}
