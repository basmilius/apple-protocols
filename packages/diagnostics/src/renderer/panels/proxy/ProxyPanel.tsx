import { useEffect, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import type { ProxyProtocol, ProxyStatus } from '@shared/contract';
import { invoke, messageOf, on } from '@/client';
import { useDevices } from '@/state/devices';
import { asCard, Banner, Button, Field, FormError, Icon, IconButton, ICONS, KeyValue, KeyValueList, PanelBody, RelativeTime, Section, Segmented, Select, StatusBar, StatusPill, TextInput, Toggle, useAsyncAction } from '@/ui';

const PROTOCOLS: readonly { readonly value: ProxyProtocol; readonly label: string; readonly port: number }[] = [
    {value: 'airplay', label: 'AirPlay', port: 7000},
    {value: 'companionLink', label: 'Companion Link', port: 49152}
];

/* The message counts move without an event, so a running proxy is polled. */
const POLL_MS = 2000;

function labelOf(protocol: ProxyProtocol): string {
    return PROTOCOLS.find(entry => entry.value === protocol)?.label ?? protocol;
}

function useProxyStatus(): { readonly proxies: readonly ProxyStatus[]; readonly error: string | null } {
    const [proxies, setProxies] = useState<readonly ProxyStatus[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const refresh = async (): Promise<void> => {
            try {
                const next = await invoke('proxy:status', undefined);

                if (active) {
                    setProxies(next);
                    setError(null);
                }
            } catch (failure) {
                if (active) {
                    setError(messageOf(failure));
                }
            }
        };

        void refresh();

        const timer = setInterval(() => void refresh(), POLL_MS);
        const unsubscribe = on('proxy:status', setProxies);

        return () => {
            active = false;
            clearInterval(timer);
            unsubscribe();
        };
    }, []);

    return {proxies, error};
}

function StartForm({running}: { readonly running: readonly ProxyProtocol[] }) {
    const devices = useDevices(state => state.devices);
    const scanning = useDevices(state => state.scanning);
    const scan = useDevices(state => state.scan);
    const [protocol, setProtocol] = useState<ProxyProtocol>('companionLink');
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [port, setPort] = useState('');
    const [capture, setCapture] = useState(false);
    const action = useAsyncAction();

    const candidates = devices.filter(device => (protocol === 'airplay' ? device.services.airplay : device.services.companionLink) !== null);
    const chosen = candidates.find(device => device.id === deviceId) ?? candidates[0] ?? null;
    const defaultPort = PROTOCOLS.find(entry => entry.value === protocol)?.port ?? 0;
    const busy = running.includes(protocol);

    const start = (): void => {
        if (chosen === null) {
            return;
        }

        void action.run(() => invoke('proxy:start', {protocol, deviceId: chosen.id, port: port.trim() === '' ? undefined : Number(port), capture}));
    };

    return (
        <Section
            title="Start a proxy"
            icon={ICONS.proxy}
            actions={<IconButton icon={RefreshCw} label="Scan for devices" size="sm" disabled={scanning} onClick={() => void scan(true)}/>}
        >
            <p className="text-xs text-text-muted">
                The proxy shows up on the network as a copy of the device. Pair an iPhone or Mac with it using the PIN it shows once it runs. It relays everything to the real device with the credentials this app stored, and the traffic panel of that device shows the messages in plain text as protocol Proxy.
            </p>
            <Segmented<ProxyProtocol> label="Protocol" value={protocol} onValueChange={setProtocol} items={PROTOCOLS.map(entry => ({value: entry.value, label: entry.label, icon: ICONS[entry.value]}))}/>
            {candidates.length === 0 ? (
                <p className="text-xs text-text-muted">{`No device with ${labelOf(protocol)} found. Scan first.`}</p>
            ) : (
                <Field label="Relay to" hint={chosen !== null && !chosen.paired.includes(protocol) ? `This app has no ${labelOf(protocol)} credentials for ${chosen.name}. Pair it first.` : undefined}>
                    <Select<string>
                        label="Relay to"
                        value={chosen?.id ?? ''}
                        onValueChange={setDeviceId}
                        items={candidates.map(device => ({value: device.id, label: `${device.name}, ${device.address}${device.paired.includes(protocol) ? '' : ', not paired'}`}))}
                    />
                </Field>
            )}
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Port" hint={protocol === 'airplay' ? 'The macOS AirPlay Receiver uses 7000.' : undefined}>
                    <TextInput label="Port" placeholder={String(defaultPort)} value={port} inputMode="numeric" mono className="max-w-28" onChange={event => setPort(event.target.value.replace(/\D/g, ''))}/>
                </Field>
                <Toggle label="Save a JSONL capture" checked={capture} onCheckedChange={setCapture}/>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" disabled={action.busy || chosen === null || busy} onClick={start}>
                    <Icon icon={ICONS.proxy} size={14}/>
                    Start
                </Button>
                {busy && <span className="text-xs text-text-muted">{`A ${labelOf(protocol)} proxy is running. Stop it first.`}</span>}
            </div>
            {action.failure && <FormError>{action.failure}</FormError>}
        </Section>
    );
}

asCard(StartForm);

function ProxyCard({proxy}: { readonly proxy: ProxyStatus }) {
    const action = useAsyncAction();

    return (
        <Section
            title={`${labelOf(proxy.protocol)} proxy`}
            icon={ICONS[proxy.protocol]}
            actions={
                <Button variant="secondary" size="sm" disabled={action.busy} onClick={() => void action.run(() => invoke('proxy:stop', {protocol: proxy.protocol}))}>
                    <Icon icon={Square} size={14}/>
                    Stop
                </Button>
            }
        >
            <div className="flex items-center gap-3">
                <span className="mono text-2xl tracking-[0.3em] text-text">{proxy.pin}</span>
                <StatusPill status="ok">running</StatusPill>
            </div>
            <KeyValueList>
                <KeyValue label="Shows up as" icon={ICONS.mdns} mono={false}>{proxy.instanceName}</KeyValue>
                <KeyValue label="Port" icon={ICONS.port}>{proxy.port}</KeyValue>
                <KeyValue label="Relays to" icon={ICONS.address}>{`${proxy.target.name}, ${proxy.target.address}:${proxy.target.port}`}</KeyValue>
                <KeyValue label="Started" icon={ICONS.timing} mono={false}><RelativeTime at={proxy.startedAt}/></KeyValue>
                <KeyValue label="Messages" icon={ICONS.traffic}>{`${proxy.messages['controller->device']} to the device, ${proxy.messages['device->controller']} back`}</KeyValue>
                {proxy.capturePath && <KeyValue label="Capture" icon={ICONS.storage}>{proxy.capturePath}</KeyValue>}
            </KeyValueList>
            {action.failure && <FormError>{action.failure}</FormError>}
        </Section>
    );
}

asCard(ProxyCard);

/** A man-in-the-middle for a real device: a controller pairs with this app, which relays to the device and taps both sides. */
export function ProxyPanel() {
    const {proxies, error} = useProxyStatus();

    return (
        <PanelBody>
            <StatusBar banner={error && <Banner placement="inline" tone="error" icon={ICONS.warning} message={error}/>}>
                <StatusPill status={proxies.length > 0 ? 'ok' : 'off'} icon={ICONS.proxy}>
                    {proxies.length > 0 ? `${proxies.length} running` : 'not running'}
                </StatusPill>
                <span className="mono">diag proxy status, diag traffic --protocol proxy --decoded</span>
            </StatusBar>

            <StartForm running={proxies.map(proxy => proxy.protocol)}/>

            {proxies.map(proxy => (
                <ProxyCard key={proxy.protocol} proxy={proxy}/>
            ))}
        </PanelBody>
    );
}
