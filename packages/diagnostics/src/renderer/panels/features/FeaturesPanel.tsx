import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { isCallFailure } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { useDevices } from '@/state/devices';
import type { PanelProps } from '@/panels/registry';
import { Badge, Button, EmptyState, Field, Icon, KeyValue, KeyValueList, PanelBody, Section, Select, type SelectItem } from '@/ui';
import { CopyButton } from '@/panels/toolkit/CopyButton';

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

const NO_DEVICE = '';

/** The features TXT value a discovered device advertises, under either of the two keys. */
const featuresOf = (txt: Readonly<Record<string, string>> | undefined): string => txt?.features ?? txt?.ft ?? '';

/**
 * A features string in, the flags it sets out. The value can be typed, or taken from the AirPlay
 * TXT record of a device in the last scan.
 */
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

        const device = devices.find(candidate => candidate.id === deviceId) ?? null;

        if (device === null) {
            return;
        }

        const record = device.services.airplay?.txt;
        setFeatures(featuresOf(record));
        setTxt(record === undefined ? '' : JSON.stringify(record, null, 4));
    };

    const decode = async (): Promise<void> => {
        setDecodeError(null);

        const result = await invoke('tool:run', {toolId: 'features.decode', deviceId: null, args: {features, txt}});

        if (isCallFailure(result)) {
            setDecoded(null);
            setDecodeError(`${result.error.name}: ${result.error.message}`);
            return;
        }

        setDecoded(result.value as Decoded);
    };

    const lookup = async (): Promise<void> => {
        setModelError(null);

        const result = await invoke('tool:run', {toolId: 'device.model', deviceId: null, args: {identifier}});

        if (isCallFailure(result)) {
            setModel(null);
            setModelError(`${result.error.name}: ${result.error.message}`);
            return;
        }

        setModel(result.value as Model);
    };

    return (
        <PanelBody>
            <Section title="Features" actions={<Select label="Source" variant="ghost" size="sm" value={source} items={deviceItems} onValueChange={pick}/>}>
                <div className="flex items-center gap-2">
                    <Field label="Features" mono placeholder="0x4A7FDFD5,0xBC157FDE" value={features} onChange={event => setFeatures(event.target.value)} className="grow"/>
                    <Button variant="primary" size="sm" onClick={() => void decode().catch(error => setDecodeError(messageOf(error)))}>
                        Decode
                    </Button>
                </div>
                <Field label="TXT record (JSON)" mono placeholder='{"model": "AppleTV14,1"}' value={txt} onChange={event => setTxt(event.target.value)}/>
                {decodeError !== null && <p className="text-xs text-status-error">{decodeError}</p>}
            </Section>

            {decoded !== null && (
                <>
                    <Section wide title="Record">
                        <KeyValueList>
                            <KeyValue label="Mask">{decoded.mask}</KeyValue>
                            <KeyValue label="Bits">{decoded.bits}</KeyValue>
                            <KeyValue label="Pairing">{decoded.pairing}</KeyValue>
                            <KeyValue label="AirPlay version">{decoded.protocolVersion}</KeyValue>
                            <KeyValue label="Password">{decoded.passwordRequired ? 'required' : 'not required'}</KeyValue>
                            <KeyValue label="Remote control">{decoded.remoteControlSupported ? 'supported' : 'unsupported'}</KeyValue>
                        </KeyValueList>
                    </Section>

                    <Section
                        title={`Flags set (${decoded.flagCount})`}
                        actions={
                            <>
                                <Field label="Filter flags" placeholder="Filter" value={filter} onChange={event => setFilter(event.target.value)} className="h-7 max-w-40"/>
                                <CopyButton text={decoded.flags.join('\n')} label="Copy flags"/>
                            </>
                        }
                    >
                        {flags.length === 0 ? (
                            <EmptyState className="py-4">No flag matches this filter.</EmptyState>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {flags.map(flag => (
                                    <Badge key={flag} tone="accent" mono>
                                        {flag}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </Section>
                </>
            )}

            <Section title="Device model">
                <div className="flex items-center gap-2">
                    <Field label="Model identifier" mono placeholder="AppleTV14,1" value={identifier} onChange={event => setIdentifier(event.target.value)} className="grow"/>
                    <Button variant="secondary" size="sm" onClick={() => void lookup().catch(error => setModelError(messageOf(error)))}>
                        <Icon icon={Search} size={14}/>
                        Look up
                    </Button>
                </div>
                {modelError !== null && <p className="text-xs text-status-error">{modelError}</p>}
                {model !== null && (
                    <KeyValueList>
                        <KeyValue label="Identifier">{model.identifier}</KeyValue>
                        <KeyValue label="Name" mono={false}>
                            {model.name}
                        </KeyValue>
                        <KeyValue label="Family">{model.isAppleTV ? 'Apple TV' : model.isHomePod ? 'HomePod' : model.isAirPort ? 'AirPort' : 'Unknown'}</KeyValue>
                    </KeyValueList>
                )}
            </Section>
        </PanelBody>
    );
}
