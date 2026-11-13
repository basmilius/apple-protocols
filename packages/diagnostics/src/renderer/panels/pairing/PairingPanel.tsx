import { useState } from 'react';
import { CircleCheck, CircleDashed, type LucideIcon } from 'lucide-react';
import type { DiscoveredDeviceInfo, PairStage, PairStatus, ProtocolName } from '@shared/contract';
import { invoke } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { MissingDevice } from '@/panels/sdk-shared';
import { useStatus } from '@/panels/shared-media/hooks';
import { Button, ConfirmDialog, FormError, Icon, ICONS, KeyValue, KeyValueList, MiddleTruncate, PanelBody, Section, Spinner, StatusPill, TextInput, useAsyncAction } from '@/ui';

const PROTOCOLS: readonly { readonly id: ProtocolName; readonly label: string; readonly icon: LucideIcon }[] = [
    {id: 'airplay', label: 'AirPlay', icon: ICONS.airplay},
    {id: 'companionLink', label: 'Companion Link', icon: ICONS.companionLink}
];

const STEPS: readonly { readonly stage: PairStage; readonly label: string }[] = [
    {stage: 'started', label: 'Connecting and asking the device to show its PIN'},
    {stage: 'awaitingPin', label: 'Type the four-digit PIN the device shows'},
    {stage: 'verifying', label: 'Running the key exchange'},
    {stage: 'done', label: 'Credentials stored'}
];

const ORDER: readonly PairStage[] = ['idle', 'started', 'awaitingPin', 'verifying', 'done'];

type CardProps = {
    readonly device: DiscoveredDeviceInfo;
    readonly protocol: (typeof PROTOCOLS)[number];
    readonly busy: boolean;
    readonly running: boolean;
    onPair(): void;
    onForget(): void;
};

function ProtocolCard({device, protocol, busy, running, onPair, onForget}: CardProps) {
    const service = protocol.id === 'airplay' ? device.services.airplay : device.services.companionLink;
    const paired = device.paired.includes(protocol.id);

    return (
        <Section
            title={protocol.label}
            icon={protocol.icon}
            actions={<StatusPill status={paired ? 'ok' : 'off'} icon={paired ? ICONS.credentials : undefined}>{paired ? 'paired' : 'not paired'}</StatusPill>}
        >
            <KeyValueList>
                <KeyValue label="Service" icon={ICONS.mdns}>
                    {service ? <MiddleTruncate text={service.fqdn}/> : 'not advertised'}
                </KeyValue>
                <KeyValue label="Stored under" icon={ICONS.identifier}>
                    <MiddleTruncate text={service?.id ?? device.id}/>
                </KeyValue>
            </KeyValueList>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant={paired ? 'secondary' : 'primary'} size="sm" disabled={busy || running || service === null} onClick={onPair}>
                    <Icon icon={ICONS.pairing} size={14}/>
                    {paired ? 'Pair again' : 'Pair'}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy || !paired} onClick={onForget}>
                    <Icon icon={ICONS.forget} size={14}/>
                    Forget
                </Button>
            </div>
        </Section>
    );
}

function StepIcon({step, current}: { readonly step: PairStage; readonly current: PairStage }) {
    const index = ORDER.indexOf(step);
    const reached = ORDER.indexOf(current);

    if (index < reached || current === 'done') {
        return <Icon icon={CircleCheck} size={14} className="text-status-idle"/>;
    }

    if (index === reached) {
        return <Spinner size={14}/>;
    }

    return <Icon icon={CircleDashed} size={14} className="text-text-faint"/>;
}

/** Pairing must work before the device has a connected session. */
export function PairingPanel({deviceId}: PanelProps) {
    const {device} = useDevice(deviceId);
    const [status] = useStatus('pair:status', 'pair:status', deviceId);
    const [pin, setPin] = useState('');
    const [forgetting, setForgetting] = useState<ProtocolName | null>(null);
    const action = useAsyncAction();

    if (device === null || deviceId === null) {
        return <MissingDevice/>;
    }

    const current: PairStatus | null = status;
    const stage = current?.stage ?? 'idle';
    const failed = stage === 'failed';
    const running = stage !== 'idle' && stage !== 'done' && !failed;
    const awaitingPin = stage === 'awaitingPin';

    const protocolLabel = PROTOCOLS.find(entry => entry.id === current?.protocol)?.label ?? '';

    const submit = (): void => {
        if (pin.length === 4) {
            void action.run(() => invoke('pair:pin', {deviceId, pin}));
        }
    };

    return (
        <PanelBody>
            {PROTOCOLS.map(protocol => (
                <ProtocolCard
                    key={protocol.id}
                    device={device}
                    protocol={protocol}
                    busy={action.busy}
                    running={running}
                    onPair={() =>
                        void action.run(async () => {
                            setPin('');
                            await invoke('pair:start', {deviceId, protocol: protocol.id});
                        })
                    }
                    onForget={() => setForgetting(protocol.id)}
                />
            ))}

            {stage !== 'idle' && (
                <Section
                    wide
                    title={`Pairing ${protocolLabel}`}
                    icon={ICONS.pin}
                    actions={
                        running && (
                            <Button variant="secondary" size="sm" disabled={action.busy} onClick={() => void action.run(() => invoke('pair:cancel', {deviceId}))}>
                                Cancel
                            </Button>
                        )
                    }
                >
                    {failed ? (
                        <StatusPill status="error">Pairing did not finish</StatusPill>
                    ) : (
                        <ol className="flex flex-col gap-1.5">
                            {STEPS.map(step => (
                                <li key={step.stage} className="flex items-center gap-2 text-xs">
                                    <StepIcon step={step.stage} current={stage}/>
                                    <span className={step.stage === stage ? 'text-text' : 'text-text-muted'}>{step.label}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                    {awaitingPin && (
                        <div className="flex items-center gap-2">
                            <TextInput
                                label="PIN"
                                placeholder="0000"
                                value={pin}
                                maxLength={4}
                                inputMode="numeric"
                                autoFocus
                                disabled={action.busy}
                                className="max-w-28 text-center text-lg tracking-[0.4em]"
                                mono
                                onChange={event => setPin(event.target.value.replace(/\D/g, ''))}
                                onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                        submit();
                                    }
                                }}
                            />
                            <Button variant="primary" size="sm" disabled={action.busy || pin.length !== 4} onClick={submit}>
                                Submit PIN
                            </Button>
                        </div>
                    )}
                    {current?.error && <FormError>{current.error}</FormError>}
                </Section>
            )}

            {action.failure && <FormError className="col-span-full">{action.failure}</FormError>}

            <ConfirmDialog
                open={forgetting !== null}
                onOpenChange={open => setForgetting(open ? forgetting : null)}
                title="Forget these credentials?"
                description={`The ${PROTOCOLS.find(entry => entry.id === forgetting)?.label ?? ''} credentials of ${device.name} are deleted. Pairing again is the only way back.`}
                confirmLabel="Forget"
                onConfirm={async () => {
                    if (forgetting !== null) {
                        await invoke('pair:forget', {deviceId, protocol: forgetting});
                    }

                    setForgetting(null);
                }}
            />
        </PanelBody>
    );
}
