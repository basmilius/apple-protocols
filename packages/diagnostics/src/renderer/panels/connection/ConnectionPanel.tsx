import { useState } from 'react';
import type { RecoveryDropTarget, RecoveryLink } from '@shared/contract';
import { invoke } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { EventFeed, MissingDevice } from '@/panels/sdk-shared';
import { useStatus } from '@/panels/shared-media/hooks';
import { Banner, Button, FormError, Icon, ICONS, KeyValue, KeyValueList, PanelBody, RelativeTime, Section, Select, type SelectItem, type Status, StatusPill, useAsyncAction } from '@/ui';

const CONNECTION_EVENTS: readonly string[] = ['status'];
const DEVICE_SOURCE = ['device'] as const;

const DROP_ITEMS: readonly SelectItem<RecoveryDropTarget>[] = [
    {value: 'data', label: 'AirPlay data stream'},
    {value: 'event', label: 'AirPlay event stream'},
    {value: 'control', label: 'AirPlay control stream'},
    {value: 'companionLink', label: 'Companion Link'}
];

const STATE_TONE: Record<string, Status> = {
    connected: 'ok',
    degraded: 'warning',
    connecting: 'busy',
    recovering: 'busy',
    offline: 'error',
    disconnected: 'off'
};

const LINK_TONE: Record<RecoveryLink['state'], Status> = {
    connected: 'ok',
    connecting: 'busy',
    waiting: 'warning',
    off: 'off'
};

function LinkRows({label, link}: { readonly label: string; readonly link: RecoveryLink }) {
    return (
        <>
            <KeyValue label={label} icon={label === 'AirPlay' ? ICONS.airplay : ICONS.companionLink}>
                <StatusPill status={LINK_TONE[link.state]}>{link.phase ? `${link.state}, ${link.phase}` : link.state}</StatusPill>
            </KeyValue>
            {link.attempt > 0 && <KeyValue label="Failed attempts">{link.attempt}</KeyValue>}
            {link.nextAttemptAt !== null && (
                <KeyValue label="Next attempt" mono={false}>
                    <RelativeTime at={link.nextAttemptAt}/>
                </KeyValue>
            )}
            {link.error !== null && <KeyValue label="Last error" mono={false}>{link.error}</KeyValue>}
        </>
    );
}

/** The device keeps itself connected; this shows how, and drops a socket to watch it recover. */
export function ConnectionPanel({deviceId}: PanelProps) {
    const {device, snapshot, connected} = useDevice(deviceId);
    const [status] = useStatus('recovery:status', 'recovery:status', deviceId);
    const [dropTarget, setDropTarget] = useState<RecoveryDropTarget>('data');
    const action = useAsyncAction();

    if (device === null || deviceId === null) {
        return <MissingDevice/>;
    }

    const connection = snapshot?.connection ?? null;
    const state = status?.state ?? null;

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
                    <Select label="Socket to drop" value={dropTarget} onValueChange={setDropTarget} items={DROP_ITEMS} size="sm"/>
                    <Button variant="danger" size="sm" disabled={action.busy || !connected} onClick={() => void action.run(() => invoke('recovery:simulateDrop', {deviceId, stream: dropTarget}))}>
                        <Icon icon={ICONS.simulateDrop} size={14}/>
                        Simulate drop
                    </Button>
                </div>
                <p className="text-xs text-text-muted">Simulate drop destroys the chosen socket, the way a network loss would. The device then recovers on its own.</p>
                {action.failure && <FormError>{action.failure}</FormError>}
            </Section>

            <Section
                title="Recovery"
                icon={ICONS.recovery}
                actions={<StatusPill status={state === null ? 'off' : (STATE_TONE[state] ?? 'off')}>{state ?? 'no session'}</StatusPill>}
            >
                <p className="text-xs text-text-muted">
                    The device retries by itself until it is disconnected: three quick attempts after 1, 2 and 4 seconds, then on an Apple TV fifteen attempts every two minutes, then every fifteen minutes. A HomePod skips the two-minute phase.
                </p>
                <KeyValueList>
                    <KeyValue label="Reason">{status?.reason ?? '-'}</KeyValue>
                    {status?.airplay && <LinkRows label="AirPlay" link={status.airplay}/>}
                    {status?.companionLink && <LinkRows label="Companion Link" link={status.companionLink}/>}
                    <KeyValue label="Last test">{status?.lastEvent ?? '-'}</KeyValue>
                    <KeyValue label="Error" mono={false}>{status?.error ?? '-'}</KeyValue>
                </KeyValueList>
            </Section>

            <EventFeed
                wide
                deviceId={deviceId}
                title="Connection events"
                sources={DEVICE_SOURCE}
                names={CONNECTION_EVENTS}
                empty="Nothing yet. Connect, then simulate a drop to see the device recover."
            />
        </PanelBody>
    );
}
