import { useCallback, useEffect, useState } from 'react';
import { ScrollArea } from '@adecore/ui';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { STORAGE_PROTOCOLS, type StorageDump, type StorageProtocol, type StoredDeviceInfo } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { ConfirmDialog, CopyButton, CountPill, EmptyState, FormError, Icon, IconButton, ICONS, JsonView, MiddleTruncate, PanelBody, Pill, Section } from '@/ui';

const LABELS: Record<StorageProtocol, string> = {
    airplay: 'AirPlay',
    companionLink: 'Companion Link',
    raop: 'RAOP'
};

type Pending = {
    readonly device: StoredDeviceInfo;
    /* Null removes the whole device. */
    readonly protocol: StorageProtocol | null;
};

function DeviceRow({device, onForget, onRemove}: { readonly device: StoredDeviceInfo; readonly onForget: (protocol: StorageProtocol) => void; readonly onRemove: () => void }) {
    return (
        <div className="flex flex-col gap-1.5 py-2">
            <div className="flex items-center gap-2">
                <div className="min-w-0 grow">
                    <p className="truncate text-xs text-text">{device.name}</p>
                    <MiddleTruncate text={device.identifier} className="mono block text-text-faint"/>
                </div>
                <IconButton icon={ICONS.forget} label={`Remove ${device.name}`} size="sm" onClick={onRemove}/>
            </div>
            <div className="flex flex-wrap items-center gap-1">
                {STORAGE_PROTOCOLS.map(protocol =>
                    device.credentials.includes(protocol) ? (
                        <Pill key={protocol} tone="accent" icon={<Icon icon={ICONS.credentials} size={12}/>} onClick={() => onForget(protocol)}>
                            {LABELS[protocol]}
                        </Pill>
                    ) : (
                        <Pill key={protocol} tone="muted">
                            {LABELS[protocol]}
                        </Pill>
                    )
                )}
            </div>
        </div>
    );
}

export function StoragePanel(_props: PanelProps) {
    const [devices, setDevices] = useState<readonly StoredDeviceInfo[]>([]);
    const [dump, setDump] = useState<StorageDump | null>(null);
    const [reveal, setReveal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);

    const refresh = useCallback(async (revealed: boolean): Promise<void> => {
        setError(null);

        try {
            const [stored, raw] = await Promise.all([invoke('storage:devices', undefined), invoke('storage:read', {reveal: revealed})]);
            setDevices(stored);
            setDump(raw);
        } catch (failure) {
            setError(messageOf(failure, 'The storage file could not be read.'));
        }
    }, []);

    useEffect(() => {
        void refresh(reveal);
    }, [refresh, reveal]);

    const confirm = async (): Promise<void> => {
        if (pending === null) {
            return;
        }

        if (pending.protocol === null) {
            await invoke('storage:removeDevice', {deviceId: pending.device.identifier});
        } else {
            await invoke('storage:removeCredentials', {deviceId: pending.device.identifier, protocol: pending.protocol});
        }

        setPending(null);
        await refresh(reveal);
    };

    return (
        <PanelBody>
            <Section
                title="Devices"
                icon={ICONS.credentials}
                actions={
                    <>
                        <CountPill>{devices.length}</CountPill>
                        <IconButton icon={RefreshCw} label="Reload" size="sm" onClick={() => void refresh(reveal)}/>
                    </>
                }
            >
                {error !== null && <FormError>{error}</FormError>}
                {devices.length === 0 ? (
                    <EmptyState icon={ICONS.credentials}>Nothing is stored. Pair a device to put credentials here.</EmptyState>
                ) : (
                    <>
                        <div className="flex flex-col divide-y divide-border-soft">
                            {devices.map(device => (
                                <DeviceRow
                                    key={device.identifier}
                                    device={device}
                                    onForget={protocol => setPending({device, protocol})}
                                    onRemove={() => setPending({device, protocol: null})}
                                />
                            ))}
                        </div>
                        <p className="text-xs text-text-muted">Click a stored protocol to forget its credentials.</p>
                    </>
                )}
            </Section>

            <Section
                title="Storage file"
                icon={ICONS.storage}
                actions={
                    <>
                        <IconButton icon={reveal ? EyeOff : Eye} label={reveal ? 'Hide the key material' : 'Reveal the key material'} size="sm" active={reveal} onClick={() => setReveal(!reveal)}/>
                        <CopyButton text={dump === null ? '' : JSON.stringify(dump.data, null, 4)} label="Copy JSON"/>
                    </>
                }
            >
                {dump?.path && <MiddleTruncate text={dump.path} className="mono block text-text-faint"/>}
                {dump === null ? (
                    <EmptyState icon={ICONS.storage}>Nothing read yet.</EmptyState>
                ) : (
                    <ScrollArea axis="both" className="rounded-lg bg-code-bg" viewportClassName="p-2">
                        <JsonView value={dump.data} defaultDepth={3}/>
                    </ScrollArea>
                )}
                {dump !== null && !dump.revealed && <p className="text-xs text-text-muted">Key material stays in main until you reveal it.</p>}
            </Section>

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={open => setPending(open ? pending : null)}
                title={pending?.protocol === null ? 'Remove this device?' : 'Forget these credentials?'}
                description={
                    pending === null
                        ? ''
                        : pending.protocol === null
                          ? `${pending.device.name} and every credential stored for it are deleted from the storage file. Pairing again is the only way back.`
                          : `The ${LABELS[pending.protocol]} credentials of ${pending.device.name} are deleted. Pairing again is the only way back.`
                }
                confirmLabel={pending?.protocol === null ? 'Remove' : 'Forget'}
                onConfirm={confirm}
            />
        </PanelBody>
    );
}
