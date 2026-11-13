import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, Search, ToggleLeft } from 'lucide-react';
import { isCallFailure } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { useDevices } from '@/state/devices';
import type { PanelProps } from '@/panels/registry';
import { BoolValue, Button, CopyButton, CountPill, EmptyState, Field, FormError, Icon, ICONS, KeyValue, KeyValueList, PanelBody, Pill, Section, Select, type SelectItem, TextArea, TextInput } from '@/ui';

type Decoded = {
    readonly mask: string;
    readonly bits: string;
    readonly flagCount: number;
    readonly flags: readonly string[];
    readonly pairing: string;
    readonly protocolVersion: number;
    readonly passwordRequired: boolean;
    readonly remoteControlSupported: boolean;
};

type Model = {
    readonly identifier: string;
    readonly name: string;
    readonly type: number;
    readonly isAppleTV: boolean;
    readonly isHomePod: boolean;
    readonly isAirPort: boolean;
};

type KnownFlag = {
    readonly name: string;
    readonly mask: string;
    readonly bit: number;
};

/* Select items need a non-empty value; this one stands for typing a value by hand. */
const NO_DEVICE = '-';

const featuresOf = (txt: Readonly<Record<string, string>> | undefined): string => txt?.features ?? txt?.ft ?? '';

async function runTool<T>(toolId: string, args: Record<string, string>): Promise<T> {
    const result = await invoke('tool:run', {toolId, deviceId: null, args});

    if (isCallFailure(result)) {
        throw new Error(`${result.error.name}: ${result.error.message}`);
    }

    return result.value as T;
}

export function FeaturesPanel(_props: PanelProps) {
    const devices = useDevices(state => state.devices);
    const [features, setFeatures] = useState('');
    const [txt, setTxt] = useState('');
    const [source, setSource] = useState(NO_DEVICE);
    const [decoded, setDecoded] = useState<Decoded | null>(null);
    const [decodeError, setDecodeError] = useState<string | null>(null);
    const [identifier, setIdentifier] = useState('AppleTV14,1');
    const [model, setModel] = useState<Model | null>(null);
    const [modelError, setModelError] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [known, setKnown] = useState<readonly KnownFlag[]>([]);

    useEffect(() => {
        void runTool<KnownFlag[]>('features.catalog', {}).then(setKnown, () => setKnown([]));
    }, []);

    const deviceItems = useMemo<SelectItem<string>[]>(
        () => [{value: NO_DEVICE, label: 'Type a value'}, ...devices.map(device => ({value: device.id, label: device.name, description: device.address}))],
        [devices]
    );

    const flags = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        const all = decoded?.flags ?? [];

        return needle.length === 0 ? all : all.filter(flag => flag.toLowerCase().includes(needle));
    }, [decoded, filter]);

    const pick = (deviceId: string): void => {
        setSource(deviceId);

        const record = devices.find(candidate => candidate.id === deviceId)?.services.airplay?.txt;

        if (record !== undefined) {
            setFeatures(featuresOf(record));
            setTxt(JSON.stringify(record, null, 4));
        }
    };

    const decode = async (): Promise<void> => {
        setDecodeError(null);

        try {
            setDecoded(await runTool<Decoded>('features.decode', {features, txt}));
        } catch (error) {
            setDecoded(null);
            setDecodeError(messageOf(error));
        }
    };

    const lookup = async (): Promise<void> => {
        setModelError(null);

        try {
            setModel(await runTool<Model>('device.model', {identifier}));
        } catch (error) {
            setModel(null);
            setModelError(messageOf(error));
        }
    };

    return (
        <PanelBody>
            <Section title="Features" icon={ToggleLeft}>
                <Field label="Source">
                    <Select label="Source" value={source} items={deviceItems} onValueChange={pick}/>
                </Field>
                <Field label="Features">
                    <TextInput label="Features" mono placeholder="0x4A7FDFD5,0xBC157FDE" value={features} onChange={event => setFeatures(event.target.value)}/>
                </Field>
                <Field label="TXT record (JSON, optional)">
                    <TextArea label="TXT record (JSON)" rows={4} placeholder='{"model": "AppleTV14,1"}' value={txt} onChange={event => setTxt(event.target.value)}/>
                </Field>
                <div>
                    <Button variant="primary" size="sm" onClick={() => void decode()}>
                        Decode
                    </Button>
                </div>
                {decodeError !== null && <FormError>{decodeError}</FormError>}
            </Section>

            {decoded !== null && (
                <>
                    <Section title="Record" icon={ICONS.info}>
                        <KeyValueList>
                            <KeyValue label="Mask">{decoded.mask}</KeyValue>
                            <KeyValue label="Bits">{decoded.bits}</KeyValue>
                            <KeyValue label="Pairing" icon={ICONS.pairing}>{decoded.pairing}</KeyValue>
                            <KeyValue label="AirPlay version" icon={ICONS.airplay}>{decoded.protocolVersion}</KeyValue>
                            <KeyValue label="Password" icon={ICONS.encryption}>
                                <BoolValue value={decoded.passwordRequired} yes="required" no="not required"/>
                            </KeyValue>
                            <KeyValue label="Remote control" icon={ICONS.remote}>
                                <BoolValue value={decoded.remoteControlSupported} yes="supported" no="unsupported"/>
                            </KeyValue>
                        </KeyValueList>
                    </Section>

                    <Section title="Flags set" icon={CircleCheck} actions={<><CountPill>{decoded.flagCount}</CountPill><CopyButton text={decoded.flags.join('\n')} label="Copy flags"/></>}>
                        <TextInput label="Filter flags" placeholder="Filter" value={filter} onChange={event => setFilter(event.target.value)}/>
                        {flags.length === 0 ? (
                            <EmptyState icon={Search}>No flag matches this filter.</EmptyState>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {flags.map(flag => (
                                    <Pill key={flag} tone="accent" mono>
                                        {flag}
                                    </Pill>
                                ))}
                            </div>
                        )}
                    </Section>
                </>
            )}

            <Section title="Every known flag" icon={ToggleLeft} collapsible defaultOpen={false} actions={<CountPill>{known.length}</CountPill>}>
                <KeyValueList>
                    {known.map(flag => (
                        <KeyValue key={flag.name} label={`bit ${flag.bit}`}>
                            <span className="flex items-center gap-1.5">
                                {decoded?.flags.includes(flag.name) && <Icon icon={CircleCheck} size={12} className="text-status-idle"/>}
                                {flag.name}
                            </span>
                        </KeyValue>
                    ))}
                </KeyValueList>
            </Section>

            <Section title="Device model" icon={ICONS.model}>
                <div className="flex items-center gap-2">
                    <TextInput label="Model identifier" mono placeholder="AppleTV14,1" value={identifier} onChange={event => setIdentifier(event.target.value)} className="grow"/>
                    <Button variant="secondary" size="sm" onClick={() => void lookup()}>
                        <Icon icon={Search} size={14}/>
                        Look up
                    </Button>
                </div>
                {modelError !== null && <FormError>{modelError}</FormError>}
                {model !== null && (
                    <KeyValueList>
                        <KeyValue label="Identifier">{model.identifier}</KeyValue>
                        <KeyValue label="Name" mono={false}>{model.name}</KeyValue>
                        <KeyValue label="Family">{model.isAppleTV ? 'Apple TV' : model.isHomePod ? 'HomePod' : model.isAirPort ? 'AirPort' : 'Unknown'}</KeyValue>
                    </KeyValueList>
                )}
            </Section>
        </PanelBody>
    );
}
