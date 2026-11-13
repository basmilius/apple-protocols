import { useEffect, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import type { AudioSourceSpec, RaopServiceInfo, RaopStatus } from '@shared/contract';
import { invoke } from '@/client';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { MissingDevice } from '@/panels/sdk-shared';
import { useStatus } from '@/panels/shared-media/hooks';
import { DEFAULT_SOURCE, SourcePicker } from '@/panels/shared-media/SourcePicker';
import { Banner, Button, Field, Icon, IconButton, ICONS, JsonView, KeyValue, KeyValueList, PanelBody, Section, Select, Slider, StatusBar, StatusPill, TextInput, useAsyncAction } from '@/ui';

/** Requires an advertised `_raop._tcp` service and uses its own RTSP connection. */
export function RaopPanel({deviceId}: PanelProps) {
    const {device} = useDevice(deviceId);
    const [status] = useStatus('raop:status', 'raop:status', deviceId);
    const [services, setServices] = useState<readonly RaopServiceInfo[]>([]);
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [source, setSource] = useState<AudioSourceSpec>(DEFAULT_SOURCE);
    const [title, setTitle] = useState('Apple Protocols Diagnostics');
    const [artist, setArtist] = useState('');
    const [volume, setVolume] = useState(30);
    const action = useAsyncAction();

    useEffect(() => {
        void invoke('raop:services', {}).then(setServices, () => setServices([]));
    }, []);

    if (device === null || deviceId === null) {
        return <MissingDevice/>;
    }

    const current: RaopStatus | null = status;
    const open = current?.connected === true;
    const streaming = current?.streaming === true;
    const onAddress = services.filter(service => service.address === device.address);
    const chosen = serviceId ?? onAddress[0]?.id ?? services[0]?.id ?? null;
    const failure = action.failure ?? current?.error ?? null;

    return (
        <PanelBody>
            <StatusBar banner={failure && <Banner placement="inline" tone="error" icon={ICONS.warning} message={failure}/>}>
                <StatusPill status={streaming ? 'busy' : open ? 'ok' : 'off'} icon={streaming ? ICONS.raop : undefined}>
                    {streaming ? 'streaming' : open ? 'session open' : 'no session'}
                </StatusPill>
                {current?.address && <span className="mono">{current.address}</span>}
                {current?.modelName && <span>{current.modelName}</span>}
            </StatusBar>

            <Section
                title="Service"
                icon={ICONS.mdns}
                actions={<IconButton icon={RefreshCw} label="Rescan RAOP services" size="sm" disabled={action.busy} onClick={() => void action.run(async () => setServices(await invoke('raop:services', {rescan: true})))}/>}
            >
                {services.length === 0 ? (
                    <p className="text-xs text-text-muted">No RAOP services found on the network yet. Rescan, or the device does not advertise one.</p>
                ) : (
                    <Select<string>
                        label="RAOP service"
                        value={chosen}
                        onValueChange={setServiceId}
                        items={services.map(service => ({value: service.id, label: service.fqdn, description: `${service.address}:${service.port}, ${service.modelName || 'unknown model'}`}))}
                    />
                )}
                <p className="text-xs text-text-muted">{onAddress.length > 0 ? `${onAddress.length} service on this device's address.` : 'Nothing on this device’s address. Pick another service to test against.'}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={action.busy || open} onClick={() => void action.run(() => invoke('raop:connect', {deviceId, serviceId: serviceId ?? onAddress[0]?.id}))}>
                        <Icon icon={ICONS.raop} size={14}/>
                        Open session
                    </Button>
                    <Button variant="secondary" size="sm" disabled={action.busy || !open} onClick={() => void action.run(() => invoke('raop:close', {deviceId}))}>
                        Close session
                    </Button>
                </div>
                {current?.lastEvent && (
                    <KeyValueList>
                        <KeyValue label="Last event">{current.lastEvent}</KeyValue>
                    </KeyValueList>
                )}
            </Section>

            <Section title="Stream" icon={ICONS.source}>
                <SourcePicker value={source} onValueChange={setSource} disabled={streaming}/>
                <div className="flex flex-wrap gap-2">
                    <Field label="Title" className="grow">
                        <TextInput label="Title" value={title} disabled={streaming} onChange={event => setTitle(event.target.value)}/>
                    </Field>
                    <Field label="Artist" className="grow">
                        <TextInput label="Artist" value={artist} disabled={streaming} onChange={event => setArtist(event.target.value)}/>
                    </Field>
                </div>
                <div className="flex items-center gap-1">
                    <Icon icon={ICONS.volume} size={14} className="shrink-0 text-text-faint"/>
                    <Slider label="Volume" value={volume} disabled={!open} onValueChange={setVolume} onValueCommitted={next => void action.run(() => invoke('raop:setVolume', {deviceId, volume: next}))}/>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{volume}%</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" disabled={action.busy || !open || streaming} onClick={() => void action.run(() => invoke('raop:stream', {deviceId, source, metadata: {title, artist}, volume}))}>
                        <Icon icon={ICONS.audio} size={14}/>
                        Start stream
                    </Button>
                    <Button variant="secondary" size="sm" disabled={action.busy || !streaming} onClick={() => void action.run(() => invoke('raop:stop', {deviceId}))}>
                        <Icon icon={Square} size={14}/>
                        Stop
                    </Button>
                </div>
            </Section>

            <Section wide title="Receiver info" icon={ICONS.info} collapsible defaultOpen={false}>
                {current?.info ? (
                    <div className="rounded-lg bg-code-bg p-2">
                        <JsonView value={current.info} defaultDepth={2}/>
                    </div>
                ) : (
                    <p className="text-xs text-text-muted">Open a session to read what the receiver reports about itself.</p>
                )}
            </Section>
        </PanelBody>
    );
}
