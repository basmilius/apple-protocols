import { Plist } from '@corewire/core/encoding';
import type { Context } from '@corewire/core/transport';
import { describeFlags } from './airplayFeatures';
import type { ControlChannel } from './channels/control';
import { parseReceiverFeatures } from './features';

/** What `GET /info` told us about the receiver. */
export type ReceiverInfo = {
    /** The `/info` plist; empty when the receiver answered with another status than 200. */
    readonly info: Record<string, any>;

    /** The receiver's feature mask; 0 when `/info` carried none. */
    readonly features: bigint;

    /** Our source version, capped to the receiver's when that is lower. Goes in SETUP bodies. */
    readonly sourceVersion: string;
};

/**
 * Fetches `/info`. A status other than 200 is not an error: what an earlier `/info` said stays, and
 * without one the receiver has no features and SETUP bodies carry our own source version. Fields
 * the answer lacks keep their earlier value too.
 */
export async function fetchInfo(control: ControlChannel, context: Context, previous?: ReceiverInfo): Promise<ReceiverInfo> {
    const ourVersion = String(context.identity.sourceVersion);
    const response = await control.get('/info');

    if (response.status !== 200) {
        context.logger.warn('[protocol]', `GET /info failed: ${response.status}`);

        return previous ?? {info: {}, features: 0n, sourceVersion: ourVersion};
    }

    const info = Plist.parse(await response.arrayBuffer()) as Record<string, any>;
    const receiverVersion = info.sourceVersion as string | undefined;
    const features = info.features != null || info.featuresEx != null ? parseReceiverFeatures(info) : previous?.features ?? 0n;

    context.logger.info('[protocol]', `Receiver: ${info.name ?? 'unknown'}, model=${info.model ?? '?'}, sourceVersion=${receiverVersion ?? '?'}`);
    context.logger.info('[protocol]', `Receiver features: ${describeFlags(features).join(', ')}`);

    if (info.initialVolume != null) {
        context.logger.info('[protocol]', `Receiver initial volume: ${info.initialVolume}`);
    }

    // A receiver that is older than us must not be told about capabilities it does not know.
    if (receiverVersion && compareVersions(ourVersion, receiverVersion) > 0) {
        context.logger.info('[protocol]', `Capping sourceVersion from ${ourVersion} to ${receiverVersion}`);

        return {info, features, sourceVersion: receiverVersion};
    }

    return {info, features, sourceVersion: previous?.sourceVersion ?? ourVersion};
}

function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;

        if (na !== nb) {
            return na - nb;
        }
    }

    return 0;
}
