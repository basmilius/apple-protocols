import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Trash2, Zap } from 'lucide-react';
import { ListRow } from '@adecore/ui';
import type { DiscoveryService, MdnsMode, MdnsRecord } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { asCard, BoolValue, Button, CommandButton, CopyButton, CountPill, EmptyState, Field, FormError, Icon, ICONS, JsonView, KeyValue, KeyValueList, PanelBody, Pill, Section, Segmented, Select, type SelectItem, TextInput } from '@/ui';

/* The service strings `@basmilius/apple-common` exports. The renderer cannot import the package. */
const AIRPLAY = '_airplay._tcp.local';
const COMPANION_LINK = '_companion-link._tcp.local';
const RAOP = '_raop._tcp.local';

const KNOWN: readonly { readonly service: string; readonly label: string }[] = [
    {service: AIRPLAY, label: 'AirPlay'},
    {service: COMPANION_LINK, label: 'Companion Link'},
    {service: RAOP, label: 'RAOP'}
];

const SERVICE_ITEMS: readonly SelectItem<DiscoveryService>[] = [
    {value: 'airplay', label: 'AirPlay'},
    {value: 'companionLink', label: 'Companion Link'},
    {value: 'raop', label: 'RAOP'}
];

const splitList = (text: string): string[] =>
    text
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

function RecordRow({record}: { readonly record: MdnsRecord }) {
    const [open, setOpen] = useState(false);
    const txt = useMemo(() => Object.entries(record.txt), [record.txt]);

    return (
        <div>
            <ListRow variant="stacked" selected={open} render={<button type="button" aria-expanded={open}/>} className="w-full cursor-default" onClick={() => setOpen(!open)}>
                <span className="flex min-w-0 items-center gap-1.5">
                    <Icon icon={open ? ChevronDown : ChevronRight} size={12} className="shrink-0 text-text-faint"/>
                    <span className="min-w-0 truncate text-xs text-text">{record.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 pl-4.5">
                    <span className="mono text-text-muted">{`${record.address}:${record.port}`}</span>
                    <Pill tone="muted">{record.pairing}</Pill>
                    <Pill tone="accent">{`v${record.protocolVersion}`}</Pill>
                    <Pill tone="muted" mono>{`${record.features?.flags.length ?? 0} flags`}</Pill>
                </span>
            </ListRow>
            {open && (
                <div className="flex flex-col gap-3 px-2.5 pt-1 pb-3">
                    <KeyValueList>
                        <KeyValue label="Service">{record.service}</KeyValue>
                        <KeyValue label="FQDN">{record.fqdn}</KeyValue>
                        <KeyValue label="Model">{record.model || '-'}</KeyValue>
                        <KeyValue label="Model name" mono={false}>{record.modelName || '-'}</KeyValue>
                        <KeyValue label="Password">
                            <BoolValue value={record.passwordRequired} yes="required" no="not required"/>
                        </KeyValue>
                        <KeyValue label="Remote control">
                            <BoolValue value={record.remoteControl} yes="supported" no="unsupported"/>
                        </KeyValue>
                        {record.features && <KeyValue label="Features">{`${record.features.raw} (${record.features.mask})`}</KeyValue>}
                    </KeyValueList>
                    {record.features && record.features.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {record.features.flags.map(flag => (
                                <Pill key={flag} tone="muted" mono>
                                    {flag}
                                </Pill>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{`TXT (${txt.length})`}</span>
                        <CopyButton text={JSON.stringify(record.txt, null, 4)} label="Copy TXT"/>
                    </div>
                    <KeyValueList>
                        {txt.map(([key, value]) => (
                            <KeyValue key={key} label={key}>
                                {value}
                            </KeyValue>
                        ))}
                    </KeyValueList>
                </div>
            )}
        </div>
    );
}

function ScanView() {
    const [mode, setMode] = useState<MdnsMode>('multicast');
    const [services, setServices] = useState<readonly string[]>([AIRPLAY, COMPANION_LINK, RAOP]);
    const [custom, setCustom] = useState('');
    const [hosts, setHosts] = useState('');
    const [timeout, setTimeoutMs] = useState('4000');
    const [records, setRecords] = useState<readonly MdnsRecord[]>([]);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (service: string): void => {
        setServices(current => (current.includes(service) ? current.filter(entry => entry !== service) : [...current, service]));
    };

    const scan = async (): Promise<void> => {
        setScanning(true);
        setError(null);

        try {
            setRecords(await invoke('mdns:scan', {mode, services: [...services, ...splitList(custom)], hosts: splitList(hosts), timeoutMs: Number(timeout) || 4000}));
        } catch (failure) {
            setError(messageOf(failure, 'The scan failed.'));
        } finally {
            setScanning(false);
        }
    };

    return (
        <>
            <Section title="Scan" icon={ICONS.mdns}>
                <Segmented<MdnsMode>
                    label="Scan mode"
                    value={mode}
                    onValueChange={setMode}
                    items={[
                        {value: 'multicast', label: 'Multicast'},
                        {value: 'unicast', label: 'Unicast'}
                    ]}
                />
                <Field label="Services">
                    <div className="flex flex-wrap gap-1.5">
                        {KNOWN.map(entry => (
                            <Pill key={entry.service} tone={services.includes(entry.service) ? 'accent' : 'muted'} pressed={services.includes(entry.service)} onClick={() => toggle(entry.service)}>
                                {entry.label}
                            </Pill>
                        ))}
                    </div>
                </Field>
                <Field label="Extra services" hint="Comma separated.">
                    <TextInput label="Extra services" mono placeholder="_raop._tcp.local" value={custom} onChange={event => setCustom(event.target.value)}/>
                </Field>
                {mode === 'unicast' && (
                    <Field label="Addresses" hint="Comma separated; unicast asks each one directly.">
                        <TextInput label="Addresses" mono placeholder="192.168.1.10, 192.168.1.11" value={hosts} onChange={event => setHosts(event.target.value)}/>
                    </Field>
                )}
                <Field label="Timeout (ms)">
                    <TextInput label="Timeout in milliseconds" type="number" value={timeout} onChange={event => setTimeoutMs(event.target.value)} className="w-28"/>
                </Field>
                <Button variant="primary" size="sm" disabled={scanning} onClick={() => void scan()}>
                    <Icon icon={ICONS.mdns} size={14}/>
                    {scanning ? 'Scanning' : 'Scan'}
                </Button>
                {error !== null && <FormError>{error}</FormError>}
            </Section>

            <Section title="Records" icon={Search} actions={<CountPill>{records.length}</CountPill>}>
                {records.length === 0 ? (
                    <EmptyState icon={ICONS.mdns}>Nothing found yet. A multicast scan answers within the timeout; unicast needs an address.</EmptyState>
                ) : (
                    <div className="-mx-2 flex flex-col gap-px">
                        {records.map(record => (
                            <RecordRow key={`${record.service}:${record.id}:${record.address}`} record={record}/>
                        ))}
                    </div>
                )}
            </Section>
        </>
    );
}

function DiscoveryView() {
    const [service, setService] = useState<DiscoveryService>('airplay');
    const [address, setAddress] = useState('');
    const [identifier, setIdentifier] = useState('');
    const [tries, setTries] = useState('10');
    const [result, setResult] = useState<unknown>(null);

    const keep = async (value: Promise<unknown>): Promise<unknown> => {
        const resolved = await value;
        setResult(resolved);

        return resolved;
    };

    return (
        <>
            <Section title="Wake" icon={Zap}>
                <Field label="Address" hint="Also used by Find by address.">
                    <TextInput label="Address to wake" mono placeholder="192.168.1.10" value={address} onChange={event => setAddress(event.target.value)}/>
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                    <CommandButton label="Knock on four ports" icon={Zap} tooltip="mdns:wake" disabled={address.trim().length === 0} run={() => invoke('mdns:wake', {address: address.trim()})}/>
                </div>
            </Section>

            <Section title="Find" icon={Search}>
                <Field label="Service">
                    <Select<DiscoveryService> label="Service" value={service} items={SERVICE_ITEMS} onValueChange={setService}/>
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                    <CommandButton label="Find by address" showResult={false} disabled={address.trim().length === 0} run={() => keep(invoke('discoverytools:findByAddress', {service, address: address.trim()}))}/>
                    <CommandButton label="Discover all" showResult={false} run={() => keep(invoke('discoverytools:discoverAll', undefined))}/>
                    <CommandButton label="Clear cache" icon={Trash2} run={() => invoke('discoverytools:clearCache', undefined)}/>
                </div>
                <Field label="Identifier">
                    <TextInput label="Identifier" mono placeholder="Living-Room.local" value={identifier} onChange={event => setIdentifier(event.target.value)}/>
                </Field>
                <Field label="Tries">
                    <TextInput label="Tries" type="number" value={tries} onChange={event => setTries(event.target.value)} className="w-20"/>
                </Field>
                <div className="flex items-center gap-2">
                    <CommandButton
                        label="Find until"
                        showResult={false}
                        disabled={identifier.trim().length === 0}
                        run={() => keep(invoke('discoverytools:findUntil', {service, id: identifier.trim(), tries: Number(tries) || 10}))}
                    />
                </div>
            </Section>

            <Section title="Result" icon={ICONS.result} actions={result !== null && <CopyButton text={JSON.stringify(result, null, 4)} label="Copy result"/>}>
                {result === null ? (
                    <EmptyState icon={ICONS.result}>Nothing run yet.</EmptyState>
                ) : (
                    <div className="overflow-auto rounded-lg bg-code-bg p-2">
                        <JsonView value={result} defaultDepth={3}/>
                    </div>
                )}
            </Section>
        </>
    );
}

asCard(ScanView);
asCard(DiscoveryView);

export function MdnsPanel(_props: PanelProps) {
    const [view, setView] = useState<'scan' | 'discovery'>('scan');

    return (
        <PanelBody>
            <div>
                <Segmented<'scan' | 'discovery'>
                    label="mDNS view"
                    value={view}
                    onValueChange={setView}
                    items={[
                        {value: 'scan', label: 'Scan', icon: ICONS.mdns},
                        {value: 'discovery', label: 'Discovery', icon: Search}
                    ]}
                />
            </div>
            {view === 'scan' ? <ScanView/> : <DiscoveryView/>}
        </PanelBody>
    );
}
