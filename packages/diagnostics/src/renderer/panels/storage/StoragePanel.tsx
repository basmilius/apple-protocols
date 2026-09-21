import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { STORAGE_PROTOCOLS, type StorageDump, type StorageProtocol, type StoredDeviceInfo } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { Badge, Button, Dialog, EmptyState, Icon, IconButton, JsonView, Section } from '@/ui';
import { CopyButton } from '@/panels/toolkit/CopyButton';

const LABELS: Record<StorageProtocol, string> = {
    airplay: 'AirPlay',
    companionLink: 'Companion Link',
    raop: 'RAOP'
};

function DeviceRow({device, onForget, onRemove}: { readonly device: StoredDeviceInfo; readonly onForget: (protocol: StorageProtocol) => void; readonly onRemove: () => void }) {
    return (
        <div className="flex items-center gap-2 border-b border-border-soft py-2 last:border-b-0">
            <div className="min-w-0 grow">
                <p className="truncate text-xs text-text">{device.name}</p>
                <p className="mono truncate text-xs text-text-faint">{device.identifier}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
                {STORAGE_PROTOCOLS.map(protocol => {
                    const stored = device.credentials.includes(protocol);

                    return stored ? (
                        <Button key={protocol} size="sm" variant="secondary" onClick={() => onForget(protocol)} title={`Forget the ${LABELS[protocol]} credentials`}>
                            {LABELS[protocol]}
                            <Icon icon={Trash2} size={12}/>
                        </Button>
                    ) : (
                        <Badge key={protocol} tone="muted">
                            {LABELS[protocol]}
                        </Badge>
                    );
                })}
            </div>
            <IconButton icon={Trash2} label={`Remove ${device.name}`} size="sm" onClick={onRemove}/>
        </div>
    );
}

/** What the credential store holds, and the only place in the app that can empty it. */
export function StoragePanel(_props: PanelProps) {
    const [devices, setDevices] = useState<readonly StoredDeviceInfo[]>([]);
    const [dump, setDump] = useState<StorageDump | null>(null);
    const [reveal, setReveal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<StoredDeviceInfo | null>(null);

    const refresh = useCallback(
        async (revealed: boolean): Promise<void> => {
            setError(null);

            try {
                const [stored, raw] = await Promise.all([invoke('storage:devices', undefined), invoke('storage:read', {reveal: revealed})]);
                setDevices(stored);
                setDump(raw);
            } catch (failure) {
                setError(messageOf(failure, 'The storage file could not be read.'));
            }
        },
        []
    );

    useEffect(() => {
        void refresh(reveal);
    }, [refresh, reveal]);

    const forget = async (deviceId: string, protocol: StorageProtocol): Promise<void> => {
        await invoke('storage:removeCredentials', {deviceId, protocol});
        await refresh(reveal);
    };

    const remove = async (deviceId: string): Promise<void> => {
        await invoke('storage:removeDevice', {deviceId});
        setConfirming(null);
        await refresh(reveal);
    };

    return (
        <div className="flex h-full flex-col gap-5 overflow-auto p-4">
            <Section
                title="Devices"
                actions={
                    <>
                        <Badge tone="muted">{devices.length}</Badge>
                        <IconButton icon={RefreshCw} label="Reload" size="sm" onClick={() => void refresh(reveal)}/>
                    </>
                }
            >
                {error !== null && <p className="text-xs text-status-error">{error}</p>}
                {devices.length === 0 ? (
                    <EmptyState className="py-4">Nothing is stored. Pair a device to put credentials here.</EmptyState>
                ) : (
                    <div className="flex flex-col">
                        {devices.map(device => (
                            <DeviceRow
                                key={device.identifier}
                                device={device}
                                onForget={protocol => void forget(device.identifier, protocol)}
                                onRemove={() => setConfirming(device)}
                            />
                        ))}
                    </div>
                )}
            </Section>

            <Section
                title="Storage file"
                actions={
                    <>
                        <IconButton icon={reveal ? EyeOff : Eye} label={reveal ? 'Hide the key material' : 'Reveal the key material'} size="sm" active={reveal} onClick={() => setReveal(!reveal)}/>
                        <CopyButton text={dump === null ? '' : JSON.stringify(dump.data, null, 4)} label="Copy JSON"/>
                    </>
                }
            >
                <p className="mono text-xs break-all text-text-faint">{dump?.path ?? ''}</p>
                <div className="overflow-auto rounded-lg border border-border bg-code-bg p-2">
                    {dump === null ? <EmptyState className="py-4">Nothing read yet.</EmptyState> : <JsonView value={dump.data} defaultDepth={3}/>}
                </div>
                {dump !== null && !dump.revealed && <p className="text-xs text-text-faint">Key material stays in main until you reveal it.</p>}
            </Section>

            <Dialog
                open={confirming !== null}
                onOpenChange={open => setConfirming(open ? confirming : null)}
                title="Remove this device?"
                description={confirming === null ? '' : `${confirming.name} and every credential stored for it are deleted from the storage file. Pairing again is the only way back.`}
                footer={
                    <>
                        <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
                            Cancel
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => confirming !== null && void remove(confirming.identifier)}>
                            Remove
                        </Button>
                    </>
                }
            >
                <p className="mono text-xs text-text-muted">{confirming?.identifier ?? ''}</p>
            </Dialog>
        </div>
    );
}
