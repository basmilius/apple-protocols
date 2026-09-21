import { useCallback, useEffect, useState } from 'react';
import type { EventMap, InvokeChannel, InvokeMap } from '@shared/contract';
import { invoke, on } from '@/client';

/**
 * Reads the initial device status, then follows pushes on the matching event channel.
 *
 * @param deviceId - Null leaves the status null.
 */
export function useStatus<C extends InvokeChannel & keyof EventMap>(channel: C, event: C, deviceId: string | null): [InvokeMap[C][1] | null, () => void] {
    const [status, setStatus] = useState<InvokeMap[C][1] | null>(null);

    const refresh = useCallback(() => {
        if (deviceId === null) {
            setStatus(null);

            return;
        }

        void invoke(channel, {deviceId} as InvokeMap[C][0]).then(setStatus, () => setStatus(null));
    }, [channel, deviceId]);

    useEffect(() => {
        refresh();

        return on(event, payload => {
            const incoming = payload as { deviceId?: string };

            if (incoming.deviceId === deviceId) {
                setStatus(payload as InvokeMap[C][1]);
            }
        });
    }, [event, deviceId, refresh]);

    return [status, refresh];
}
