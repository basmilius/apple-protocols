import { useMemo, useState } from 'react';
import { Plug, PlugZap, Power, Unplug } from 'lucide-react';
import type { RecoveryStatus } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { invoke, messageOf } from '@/client';
import { useDevice, useDeviceEvents } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { useStatus } from '@/panels/shared-media/hooks';
import { Badge, Button, EmptyState, Field, Icon, KeyValue, KeyValueList, PanelBody, Section, Toggle } from '@/ui';

/** The device events that say something about the connection itself. */
const CONNECTION_EVENTS: readonly string[] = ['connected', 'disconnected', 'recovering', 'recovered', 'recoveryFailed'];

/**
 * Connection recovery, which the SDK never wires up on its own. The toggle arms a
 * `ConnectionRecovery` in main, and "simulate drop" destroys the data stream socket so the
 * recovery path can be walked without unplugging anything.
 */
export function ConnectionPanel({deviceId}: PanelProps) {
    const {device, snapshot, connected, busy, connect, disconnect} = useDevice(deviceId);
    const [status] = useStatus('recovery:status', 'recovery:status', deviceId);
    const [baseDelay, setBaseDelay] = useState(1000);
    const [maxDelay, setMaxDelay] = useState(30000);
    const [maxAttempts, setMaxAttempts] = useState(3);
    const [error, setError] = useState<string | null>(null);
    const [working, setWorking] = useState(false);

    const names = useMemo(() => CONNECTION_EVENTS, []);
    const events = useDeviceEvents(deviceId, {sources: ['device'], names, limit: 50});

    if (device === null || deviceId === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>This device is not in the last scan. Rescan to bring it back.</EmptyState>
            </div>
        );
    }

    const current: RecoveryStatus | null = status;
    const enabled = current?.enabled === true;
    const connection = snapshot?.connection ?? null;

    const run = async (action: () => Promise<unknown>): Promise<void> => {
        setWorking(true);
        setError(null);

        try {
            await action();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setWorking(false);
        }
    };

    const configure = (next: boolean): Promise<unknown> => invoke('recovery:configure', {deviceId, enabled: next, options: {baseDelay, maxDelay, maxAttempts}});

    return (
        <PanelBody>
            <Section
                title="Connection"
                actions={
                    connected ? (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void disconnect()}>
                            <Icon icon={Plug} size={14}/>
                            Disconnect
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" disabled={busy} onClick={() => void connect()}>
                            <Icon icon={PlugZap} size={14}/>
                            Connect
                        </Button>
                    )
                }
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={connected ? 'idle' : 'muted'}>{connection?.status ?? 'disconnected'}</Badge>
                    <Badge tone={connection?.airplay.connected ? 'idle' : 'muted'}>AirPlay</Badge>
                    {connection?.companionLink.available && <Badge tone={connection.companionLink.connected ? 'idle' : 'muted'}>Companion Link</Badge>}
                </div>
                <KeyValueList>
                    <KeyValue label="Address">{device.address}</KeyValue>
                    <KeyValue label="Snapshot at">{snapshot ? formatTime(snapshot.updatedAt) : '-'}</KeyValue>
                    <KeyValue label="Last error">{connection?.error ?? '-'}</KeyValue>
                </KeyValueList>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={working} onClick={() => void run(() => invoke('recovery:wake', {deviceId}))}>
                        <Icon icon={Power} size={14}/>
                        Wake
                    </Button>
                    <Button variant="danger" size="sm" disabled={working || !connected} onClick={() => void run(() => invoke('recovery:simulateDrop', {deviceId}))}>
                        <Icon icon={Unplug} size={14}/>
                        Simulate drop
                    </Button>
                </div>
            </Section>

            <Section title="Recovery" actions={<Badge tone={current?.recovering ? 'running' : enabled ? 'idle' : 'muted'}>{current?.recovering ? `attempt ${current.attempt}` : enabled ? 'armed' : 'off'}</Badge>}>
                <Toggle label="Recover from unexpected disconnects" checked={enabled} disabled={working || !connected} onCheckedChange={next => void run(() => configure(next))}/>
                <div className="flex flex-wrap items-center gap-2">
                    <Field label="Base delay (ms)" type="number" value={baseDelay} disabled={enabled} onChange={event => setBaseDelay(Number(event.target.value))} className="max-w-32" mono/>
                    <Field label="Max delay (ms)" type="number" value={maxDelay} disabled={enabled} onChange={event => setMaxDelay(Number(event.target.value))} className="max-w-32" mono/>
                    <Field label="Max attempts" type="number" value={maxAttempts} disabled={enabled} onChange={event => setMaxAttempts(Number(event.target.value))} className="max-w-28" mono/>
                </div>
                <p className="text-xs text-text-muted">
                    Delays double each attempt up to the maximum. Arming needs a live session, because recovery listens for the device&apos;s own disconnect. Options are read when the toggle is switched on.
                </p>
                <KeyValueList>
                    <KeyValue label="Last event">{current?.lastEvent ?? '-'}</KeyValue>
                    <KeyValue label="Errors">{current?.error ?? '-'}</KeyValue>
                </KeyValueList>
                {error && <p className="text-xs text-status-error">{error}</p>}
            </Section>

            <Section wide title="Connection events">
                {events.length === 0 ? (
                    <p className="text-xs text-text-muted">Nothing yet. Connect, then simulate a drop to see recovery walk its attempts.</p>
                ) : (
                    <table className="w-full table-fixed border-collapse">
                        <tbody>
                            {[...events].reverse().map(event => (
                                <tr key={event.sequence} className="border-b border-border-soft">
                                    <td className="w-24 px-2 py-1 align-top">
                                        <span className="mono text-code-dim">{formatTime(event.timestamp)}</span>
                                    </td>
                                    <td className="w-36 px-1 py-1 align-top text-xs">{event.name}</td>
                                    <td className="mono truncate px-2 py-1 align-top text-xs text-text-muted">{event.payload.length === 0 ? '' : JSON.stringify(event.payload)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>
        </PanelBody>
    );
}
