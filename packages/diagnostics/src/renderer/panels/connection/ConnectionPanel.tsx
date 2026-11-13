import { useState } from 'react';
import type { RecoveryStatus } from '@shared/contract';
import { invoke } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { EventFeed, MissingDevice } from '@/panels/sdk-shared';
import { useStatus } from '@/panels/shared-media/hooks';
import { Banner, Button, Field, FormError, Icon, ICONS, KeyValue, KeyValueList, PanelBody, RelativeTime, Section, StatusPill, TextInput, Toggle, useAsyncAction } from '@/ui';

const CONNECTION_EVENTS: readonly string[] = ['connected', 'disconnected', 'recovering', 'recovered', 'recoveryFailed'];
const DEVICE_SOURCE = ['device'] as const;

/** Arms `ConnectionRecovery` in main; simulate-drop destroys the DataStream socket to test recovery. */
export function ConnectionPanel({deviceId}: PanelProps) {
    const {device, snapshot, connected} = useDevice(deviceId);
    const [status] = useStatus('recovery:status', 'recovery:status', deviceId);
    const [baseDelay, setBaseDelay] = useState(1000);
    const [maxDelay, setMaxDelay] = useState(30000);
    const [maxAttempts, setMaxAttempts] = useState(3);
    const action = useAsyncAction();

    if (device === null || deviceId === null) {
        return <MissingDevice/>;
    }

    const current: RecoveryStatus | null = status;
    const enabled = current?.enabled === true;
    const connection = snapshot?.connection ?? null;

    const configure = (next: boolean): Promise<unknown> => invoke('recovery:configure', {deviceId, enabled: next, options: {baseDelay, maxDelay, maxAttempts}});

    return (
        <PanelBody>
            <Section title="Protocols" icon={ICONS.connection}>
                {connection?.error && <Banner placement="inline" tone="error" icon={ICONS.warning} message={connection.error}/>}
                <KeyValueList>
                    <KeyValue label="Session" icon={ICONS.connection}>
                        <StatusPill status={connected ? 'ok' : connection?.status === 'failed' ? 'error' : connection?.status === 'connecting' || connection?.status === 'recovering' ? 'busy' : 'off'}>
                            {connection?.status ?? 'disconnected'}
                        </StatusPill>
                    </KeyValue>
                    <KeyValue label="AirPlay" icon={ICONS.airplay}>
                        <StatusPill status={connection?.airplay.connected ? 'ok' : 'off'}>{connection?.airplay.connected ? 'connected' : 'not connected'}</StatusPill>
                    </KeyValue>
                    {connection?.companionLink.available && (
                        <KeyValue label="Companion Link" icon={ICONS.companionLink}>
                            <StatusPill status={connection.companionLink.connected ? 'ok' : 'off'}>{connection.companionLink.connected ? 'connected' : 'not connected'}</StatusPill>
                        </KeyValue>
                    )}
                    <KeyValue label="Address" icon={ICONS.address}>{device.address}</KeyValue>
                    <KeyValue label="Snapshot" icon={ICONS.timing} mono={false}>
                        {snapshot ? <RelativeTime at={snapshot.updatedAt}/> : '-'}
                    </KeyValue>
                </KeyValueList>
            </Section>

            <Section title="Tests" icon={ICONS.advanced}>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" disabled={action.busy} title="Knocks on four ports; works without a session" onClick={() => void action.run(() => invoke('recovery:wake', {deviceId}))}>
                        <Icon icon={ICONS.knock} size={14}/>
                        Knock to wake
                    </Button>
                    <Button variant="danger" size="sm" disabled={action.busy || !connected} onClick={() => void action.run(() => invoke('recovery:simulateDrop', {deviceId}))}>
                        <Icon icon={ICONS.simulateDrop} size={14}/>
                        Simulate drop
                    </Button>
                </div>
                <p className="text-xs text-text-muted">Simulate drop destroys the data stream socket, the way a network loss would.</p>
            </Section>

            <Section
                title="Recovery"
                icon={ICONS.recovery}
                actions={<StatusPill status={current?.recovering ? 'busy' : enabled ? 'ok' : 'off'}>{current?.recovering ? `attempt ${current.attempt}` : enabled ? 'armed' : 'off'}</StatusPill>}
            >
                <div className="flex flex-wrap items-end gap-2">
                    <Field label="Base delay (ms)">
                        <TextInput label="Base delay (ms)" type="number" value={baseDelay} disabled={enabled} onChange={event => setBaseDelay(Number(event.target.value))} className="max-w-32" mono/>
                    </Field>
                    <Field label="Max delay (ms)">
                        <TextInput label="Max delay (ms)" type="number" value={maxDelay} disabled={enabled} onChange={event => setMaxDelay(Number(event.target.value))} className="max-w-32" mono/>
                    </Field>
                    <Field label="Max attempts">
                        <TextInput label="Max attempts" type="number" value={maxAttempts} disabled={enabled} onChange={event => setMaxAttempts(Number(event.target.value))} className="max-w-28" mono/>
                    </Field>
                </div>
                <Toggle label="Recover from unexpected disconnects" checked={enabled} disabled={action.busy || !connected} onCheckedChange={next => void action.run(() => configure(next))}/>
                <p className="text-xs text-text-muted">Delays double each attempt up to the maximum. Arming needs a live session, and the options above are read when recovery is switched on.</p>
                <KeyValueList>
                    <KeyValue label="Last event">{current?.lastEvent ?? '-'}</KeyValue>
                    <KeyValue label="Errors">{current?.error ?? '-'}</KeyValue>
                </KeyValueList>
                {action.failure && <FormError>{action.failure}</FormError>}
            </Section>

            <EventFeed
                wide
                deviceId={deviceId}
                title="Connection events"
                sources={DEVICE_SOURCE}
                names={CONNECTION_EVENTS}
                empty="Nothing yet. Connect, then simulate a drop to see recovery walk its attempts."
            />
        </PanelBody>
    );
}
