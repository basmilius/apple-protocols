import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Radio, Trash2, Zap } from 'lucide-react';
import type { DiscoveryService, MdnsMode, MdnsRecord } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import type { PanelProps } from '@/panels/registry';
import { Badge, Button, CommandButton, EmptyState, Field, Icon, JsonView, KeyValue, KeyValueList, Section, Segmented, Select, type SelectItem, TabPanel, Tabs } from '@/ui';
import { CopyButton } from '@/panels/toolkit/CopyButton';

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

function RecordRow({record}: { readonly record: MdnsRecord }) {
    const [open, setOpen] = useState(false);
    const txt = useMemo(() => Object.entries(record.txt), [record.txt]);

    return (
        <>
            <tr className={clsx('cursor-default border-b border-border-soft', open ? 'bg-surface-active' : 'hover:bg-surface-hover')} onClick={() => setOpen(!open)}>
                <td className="w-6 pl-2 align-top">
                    <Icon icon={open ? ChevronDown : ChevronRight} size={12}/>
                </td>
                <td className="truncate px-1 py-1 align-top text-xs">{record.name}</td>
                <td className="mono w-40 px-1 py-1 align-top text-xs text-text-muted">
                    {record.address}:{record.port}
                </td>
                <td className="w-24 px-1 py-1 align-top">
                    <Badge tone="muted">{record.pairing}</Badge>
                </td>
                <td className="w-16 px-1 py-1 align-top">
                    <Badge tone="accent">v{record.protocolVersion}</Badge>
                </td>
                <td className="w-14 px-1 py-1 text-right align-top">
                    <span className="mono text-xs text-text-faint">{record.features?.flags.length ?? 0}</span>
                </td>
            </tr>
            {open && (
                <tr className="border-b border-border-soft bg-surface-sunken">
                    <td colSpan={6} className="px-3 py-2">
                        <div className="flex flex-col gap-3">
                            <KeyValueList>
                                <KeyValue label="Service">{record.service}</KeyValue>
                                <KeyValue label="FQDN">{record.fqdn}</KeyValue>
                                <KeyValue label="Model">{record.model || '-'}</KeyValue>
                                <KeyValue label="Model name" mono={false}>
                                    {record.modelName || '-'}
                                </KeyValue>
                                <KeyValue label="Password">{record.passwordRequired ? 'required' : 'not required'}</KeyValue>
                                <KeyValue label="Remote control">{record.remoteControl ? 'supported' : 'unsupported'}</KeyValue>
                                {record.features && <KeyValue label="Features">{`${record.features.raw} (${record.features.mask})`}</KeyValue>}
                            </KeyValueList>
                            {record.features && record.features.flags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {record.features.flags.map(flag => (
                                        <Badge key={flag} tone="idle" mono>
                                            {flag}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <div>
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="text-xs text-text-faint">TXT ({txt.length})</span>
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
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function ScanTab() {
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

        const extra = custom
            .split(',')
            .map(entry => entry.trim())
            .filter(entry => entry.length > 0);

        try {
            setRecords(
                await invoke('mdns:scan', {
                    mode,
                    services: [...services, ...extra],
                    hosts: hosts
                        .split(',')
                        .map(entry => entry.trim())
                        .filter(entry => entry.length > 0),
                    timeoutMs: Number(timeout) || 4000
                })
            );
        } catch (failure) {
            setError(messageOf(failure, 'The scan failed.'));
        } finally {
            setScanning(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented<MdnsMode>
                        label="Scan mode"
                        value={mode}
                        onValueChange={setMode}
                        items={[
                            {value: 'multicast', label: 'Multicast'},
                            {value: 'unicast', label: 'Unicast'}
                        ]}
                    />
                    {KNOWN.map(entry => (
                        <Button key={entry.service} size="sm" variant={services.includes(entry.service) ? 'primary' : 'secondary'} onClick={() => toggle(entry.service)}>
                            {entry.label}
                        </Button>
                    ))}
                    <Field label="Extra services" mono placeholder="_raop._tcp.local" value={custom} onChange={event => setCustom(event.target.value)} className="h-7 max-w-56"/>
                    <Field label="Timeout in milliseconds" type="number" value={timeout} onChange={event => setTimeoutMs(event.target.value)} className="h-7 w-24"/>
                    {mode === 'unicast' && (
                        <Field label="Addresses" mono placeholder="192.168.1.10, 192.168.1.11" value={hosts} onChange={event => setHosts(event.target.value)} className="h-7 max-w-64"/>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                        <Badge tone="muted">{records.length}</Badge>
                        <Button variant="primary" size="sm" disabled={scanning} onClick={() => void scan()}>
                            <Icon icon={Radio} size={14}/>
                            {scanning ? 'Scanning' : 'Scan'}
                        </Button>
                    </span>
                </div>
                {error !== null && <p className="mt-2 text-xs text-status-error">{error}</p>}
            </div>
            <div className="min-h-0 grow overflow-auto">
                {records.length === 0 ? (
                    <EmptyState>Nothing found yet. A multicast scan answers within the timeout; unicast needs an address.</EmptyState>
                ) : (
                    <table className="w-full table-fixed border-collapse">
                        <tbody>
                            {records.map(record => (
                                <RecordRow key={`${record.service}:${record.id}:${record.address}`} record={record}/>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function DiscoveryTab() {
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
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-col gap-4 overflow-auto p-4">
                <Section title="Wake" actions={<Badge tone="muted">4 ports</Badge>}>
                    <div className="flex items-center gap-2">
                        <Field label="Address to wake" mono placeholder="192.168.1.10" value={address} onChange={event => setAddress(event.target.value)} className="grow"/>
                        <CommandButton label="Wake" icon={<Icon icon={Zap} size={14}/>} disabled={address.trim().length === 0} run={() => invoke('mdns:wake', {address: address.trim()})}/>
                    </div>
                </Section>

                <Section title="Find" actions={<Select<DiscoveryService> label="Service" variant="ghost" size="sm" value={service} items={SERVICE_ITEMS} onValueChange={setService}/>}>
                    <div className="flex flex-wrap items-center gap-2">
                        <CommandButton
                            label="Find by address"
                            disabled={address.trim().length === 0}
                            run={() => keep(invoke('discoverytools:findByAddress', {service, address: address.trim()}))}
                        />
                        <CommandButton label="Discover all" run={() => keep(invoke('discoverytools:discoverAll', undefined))}/>
                        <CommandButton label="Clear cache" icon={<Icon icon={Trash2} size={14}/>} run={() => invoke('discoverytools:clearCache', undefined)}/>
                    </div>
                    <div className="flex items-center gap-2">
                        <Field label="Identifier" mono placeholder="Living-Room.local" value={identifier} onChange={event => setIdentifier(event.target.value)} className="grow"/>
                        <Field label="Tries" type="number" value={tries} onChange={event => setTries(event.target.value)} className="w-20"/>
                        <CommandButton
                            label="Find until"
                            disabled={identifier.trim().length === 0}
                            run={() => keep(invoke('discoverytools:findUntil', {service, id: identifier.trim(), tries: Number(tries) || 10}))}
                        />
                    </div>
                </Section>

                <Section title="Result" actions={result === null ? null : <CopyButton text={JSON.stringify(result, null, 4)} label="Copy result"/>}>
                    <div className="overflow-auto rounded-lg border border-border bg-code-bg p-2">
                        {result === null ? <EmptyState className="py-4">Nothing run yet.</EmptyState> : <JsonView value={result} defaultDepth={3}/>}
                    </div>
                </Section>
            </div>
        </div>
    );
}

/** The mDNS bench: raw scans on one tab, the `Discovery` class on the other. */
export function MdnsPanel(_props: PanelProps) {
    const [tab, setTab] = useState('scan');

    return (
        <Tabs
            label="mDNS"
            value={tab}
            onValueChange={setTab}
            className="h-full"
            items={[
                {value: 'scan', label: 'Scan'},
                {value: 'discovery', label: 'Discovery'}
            ]}
        >
            <TabPanel value="scan">
                <ScanTab/>
            </TabPanel>
            <TabPanel value="discovery">
                <DiscoveryTab/>
            </TabPanel>
        </Tabs>
    );
}
