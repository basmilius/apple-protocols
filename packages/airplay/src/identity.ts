import { type Context, DEFAULT_CLIENT_NAME, type DeviceIdentity } from '@corewire/core/transport';

/** Every identity field, with the defaults filled in. */
export type ResolvedIdentity = Required<DeviceIdentity>;

/**
 * The identity an AirPlay client presents when the consumer overrides nothing: an iPhone running
 * the Apple TV Remote app, which receivers accept for remote control and audio.
 */
export const DEFAULT_IDENTITY: ResolvedIdentity = {
    name: DEFAULT_CLIENT_NAME,
    model: 'iPhone17,3',
    osName: 'iPhone OS',
    osVersion: '26.3',
    osBuildVersion: '25D63',
    sourceVersion: '935.7.1',
    applicationBundleIdentifier: 'com.apple.TVRemote',
    applicationBundleVersion: '700'
};

/** The identity of the context with the AirPlay defaults for what it leaves out. */
export function resolveIdentity(context: Context): ResolvedIdentity {
    return {...DEFAULT_IDENTITY, ...withoutUndefined(context.identity)};
}

function withoutUndefined(identity: DeviceIdentity): DeviceIdentity {
    return Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined));
}
