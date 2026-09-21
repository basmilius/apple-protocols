import { AIRPLAY_PROTOCOL, AppleTV, COMPANION_LINK_PROTOCOL } from '@basmilius/apple-sdk';
import type { CallResult } from '@shared/contract';
import { handle } from '../../ipc';
import { serialize, serializeError } from '../../serialize';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';
import { RAW_CATALOG, rawEntry, type RawTargets } from './rawCatalog';

/** Registers `raw:*`: the catalog the form is generated from, and the call that runs one entry. */
export function registerRawChannels(context: ChannelContext): void {
    handle('raw:builders', () => RAW_CATALOG);

    handle('raw:send', async request => {
        const started = Date.now();

        try {
            const session = context.sessions.sessions.get(request.deviceId);

            if (!session) {
                throw new Error(`No session for device '${request.deviceId}'. Connect first.`);
            }

            const entry = rawEntry(request.transport, request.id);
            const value = await entry.run(targetsOf(session), request.args, request.exchange === true);

            return {ok: true, kind: 'call', value: serialize(value), durationMs: Date.now() - started} satisfies CallResult;
        } catch (error) {
            return {ok: false, error: serializeError(error)} satisfies CallResult;
        }
    });
}

function targetsOf(session: DeviceSession): RawTargets {
    const device = session.device;

    if (device === null) {
        return {};
    }

    const protocol = device.airplay[AIRPLAY_PROTOCOL];
    const companionLink = device instanceof AppleTV ? device.companionLink?.[COMPANION_LINK_PROTOCOL] : undefined;

    return {
        dataStream: protocol.dataStream as unknown as RawTargets['dataStream'],
        companionLink: companionLink as unknown as RawTargets['companionLink'],
        controlStream: protocol.controlStream as unknown as RawTargets['controlStream'],
        protocol: protocol as unknown as RawTargets['protocol']
    };
}
