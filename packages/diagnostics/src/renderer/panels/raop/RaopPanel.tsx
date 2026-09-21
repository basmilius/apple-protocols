import { useEffect, useState } from 'react';
import { PlugZap, RefreshCw, Square, Waves } from 'lucide-react';
import type { AudioSourceSpec, RaopServiceInfo, RaopStatus } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { useStatus } from '@/panels/shared-media/hooks';
import { DEFAULT_SOURCE, SourcePicker } from '@/panels/shared-media/SourcePicker';
import { Badge, Button, EmptyState, Field, Icon, JsonView, KeyValue, KeyValueList, PanelBody, Section, Select, Slider } from '@/ui';

/**
 * RAOP runs on its own RTSP connection to a `_raop._tcp` service, next to whatever the AirPlay
 * session is doing. A device without that service cannot be reached here.
 */
export function RaopPanel({deviceId}: PanelProps) {
    const {device} = useDevice(deviceId);
    const [status] = useStatus('raop:status', 'raop:status', deviceId);
    const [services, setServices] = useState<readonly RaopServiceInfo[]>([]);
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [source, setSource] = useState<AudioSourceSpec>(DEFAULT_SOURCE);
    const [title, setTitle] = useState('Apple Protocols Diagnostics');
    const [artist, setArtist] = useState('');
    const [volume, setVolume] = useState(30);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void invoke('raop:services', {}).then(setServices, () => setServices([]));
    }, []);

    if (device === null || deviceId === null) {
        return (
            <div className="grid h-full place-items-center">
                <EmptyState>This device is not in the last scan. Rescan to bring it back.</EmptyState>
            </div>
        );
    }

    const current: RaopStatus | null = status;
    const connected = current?.connected === true;
    const streaming = current?.streaming === true;
    const onAddress = services.filter(service => service.address === device.address);

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
            <Section
                title="Service"
                actions={
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => setServices(await invoke('raop:services', {rescan: true})))}>
                        <Icon icon={RefreshCw} size={14}/>
                        Rescan
                    </Button>
                }
            >
                {services.length === 0 ? (
                    <p className="text-xs text-text-muted">No RAOP services found on the network yet. Rescan, or the device does not advertise one.</p>
                ) : (
                    <Select<string>
                        label="RAOP service"
                        value={serviceId ?? onAddress[0]?.id ?? services[0]?.id ?? null}
                        onValueChange={setServiceId}
                        items={services.map(service => ({value: service.id, label: service.fqdn, description: `${service.address}:${service.port} - ${service.modelName || 'unknown model'}`}))}
                    />
                )}
                <p className="text-xs text-text-muted">{onAddress.length > 0 ? `${onAddress.length} service on this device's address.` : 'Nothing on this device’s address. Pick another service to test against.'}</p>
            </Section>

            <Section title="Session" actions={<Badge tone={streaming ? 'running' : connected ? 'idle' : 'muted'}>{streaming ? 'streaming' : connected ? 'connected' : 'closed'}</Badge>}>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={busy || connected} onClick={() => void run(() => invoke('raop:connect', {deviceId, serviceId: serviceId ?? onAddress[0]?.id}))}>
                        <Icon icon={PlugZap} size={14}/>
                        Connect
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy || !connected} onClick={() => void run(() => invoke('raop:close', {deviceId}))}>
                        Close
                    </Button>
                </div>
                <KeyValueList>
                    <KeyValue label="Address">{current?.address ?? '-'}</KeyValue>
                    <KeyValue label="Model">{current?.modelName || '-'}</KeyValue>
                    <KeyValue label="Last event">{current?.lastEvent ?? '-'}</KeyValue>
                </KeyValueList>
            </Section>

            <Section title="Stream">
                <SourcePicker value={source} onValueChange={setSource} disabled={streaming}/>
                <div className="flex items-center gap-2">
                    <Field label="Title" value={title} disabled={streaming} onChange={event => setTitle(event.target.value)} className="grow"/>
                    <Field label="Artist" value={artist} disabled={streaming} onChange={event => setArtist(event.target.value)} className="grow"/>
                </div>
                <div className="flex items-center gap-3">
                    <Slider label="Volume" value={volume} disabled={!connected} onValueChange={setVolume} onValueCommitted={next => void run(() => invoke('raop:setVolume', {deviceId, volume: next}))}/>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{volume}%</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={busy || !connected || streaming} onClick={() => void run(() => invoke('raop:stream', {deviceId, source, metadata: {title, artist}, volume}))}>
                        <Icon icon={Waves} size={14}/>
                        Start stream
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy || !streaming} onClick={() => void run(() => invoke('raop:stop', {deviceId}))}>
                        <Icon icon={Square} size={14}/>
                        Stop
                    </Button>
                </div>
            </Section>

            <Section title="Receiver info">{current?.info ? <JsonView value={current.info} defaultDepth={2}/> : <p className="text-xs text-text-muted">Connect to read what the receiver reports about itself.</p>}</Section>

            {(error ?? current?.error) && <p className="text-xs text-status-error">{error ?? current?.error}</p>}
        </PanelBody>
    );
}
