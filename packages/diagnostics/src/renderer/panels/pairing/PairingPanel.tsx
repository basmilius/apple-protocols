import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import type { PairStage, PairStatus, ProtocolName } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { useStatus } from '@/panels/shared-media/hooks';
import { Badge, Button, EmptyState, Field, Icon, KeyValue, KeyValueList, PanelBody, Section, Segmented } from '@/ui';

const STAGE_TONE: Record<PairStage, 'muted' | 'accent' | 'running' | 'idle' | 'error'> = {
    idle: 'muted',
    started: 'running',
    awaitingPin: 'accent',
    verifying: 'running',
    done: 'idle',
    failed: 'error'
};

const STAGE_TEXT: Record<PairStage, string> = {
    idle: 'Nothing is running.',
    started: 'Connecting and asking the device to show its PIN.',
    awaitingPin: 'The device is showing a four-digit PIN. Type it below.',
    verifying: 'Running the key exchange.',
    done: 'Credentials stored.',
    failed: 'Pairing did not finish.'
};

/**
 * Pairing for both protocols. It works while the device is disconnected, which is the only state a
 * device that has never been paired can be in.
 */
export function PairingPanel({deviceId}: PanelProps) {
    const {device} = useDevice(deviceId);
    const [status] = useStatus('pair:status', 'pair:status', deviceId);
    const [protocol, setProtocol] = useState<ProtocolName>('airplay');
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (device === null || deviceId === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>This device is not in the last scan. Rescan to bring it back.</EmptyState>
            </div>
        );
    }

    const current: PairStatus | null = status;
    const stage = current?.stage ?? 'idle';
    const awaitingPin = stage === 'awaitingPin';
    const service = protocol === 'airplay' ? device.services.airplay : device.services.companionLink;

    const run = async (action: () => Promise<unknown>): Promise<void> => {
        setBusy(true);
        setError(null);

        try {
            await action();
        } catch (failure) {
            setError(messageOf(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PanelBody>
            <Section title="Protocol" actions={<Badge tone={STAGE_TONE[stage]}>{stage}</Badge>}>
                <Segmented<ProtocolName>
                    label="Protocol"
                    value={protocol}
                    onValueChange={setProtocol}
                    items={[
                        {value: 'airplay', label: 'AirPlay'},
                        {value: 'companionLink', label: 'Companion Link'}
                    ]}
                />
                <KeyValueList>
                    <KeyValue label="Service">{service?.fqdn ?? 'not advertised'}</KeyValue>
                    <KeyValue label="Stored under">{service?.id ?? device.id}</KeyValue>
                    <KeyValue label="Paired">{device.paired.includes(protocol) ? 'yes' : 'no'}</KeyValue>
                </KeyValueList>
                <p className="text-xs text-text-muted">{STAGE_TEXT[stage]}</p>
                {current?.error && <p className="text-xs text-status-error">{current.error}</p>}
                {error && <p className="text-xs text-status-error">{error}</p>}
            </Section>

            <Section title="Pair">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || service === null || awaitingPin}
                        onClick={() =>
                            void run(async () => {
                                setPin('');
                                await invoke('pair:start', {deviceId, protocol});
                            })
                        }
                    >
                        <Icon icon={KeyRound} size={14}/>
                        Start pairing
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy || stage === 'idle'} onClick={() => void run(() => invoke('pair:cancel', {deviceId}))}>
                        Cancel
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Field
                        label="PIN"
                        placeholder="0000"
                        value={pin}
                        maxLength={4}
                        inputMode="numeric"
                        disabled={!awaitingPin || busy}
                        className="max-w-28"
                        mono
                        onChange={event => setPin(event.target.value.replace(/\D/g, ''))}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && pin.length === 4) {
                                void run(() => invoke('pair:pin', {deviceId, pin}));
                            }
                        }}
                    />
                    <Button variant="primary" size="sm" disabled={!awaitingPin || busy || pin.length !== 4} onClick={() => void run(() => invoke('pair:pin', {deviceId, pin}))}>
                        Submit PIN
                    </Button>
                </div>
            </Section>

            <Section title="Stored credentials">
                <div className="flex flex-wrap items-center gap-1.5">
                    {device.paired.length === 0 ? <span className="text-xs text-text-muted">Nothing stored for this device.</span> : device.paired.map(name => <Badge key={name} tone="accent">{name}</Badge>)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="danger" size="sm" disabled={busy || !device.paired.includes(protocol)} onClick={() => void run(() => invoke('pair:forget', {deviceId, protocol}))}>
                        <Icon icon={Trash2} size={14}/>
                        Forget {protocol}
                    </Button>
                </div>
            </Section>
        </PanelBody>
    );
}
