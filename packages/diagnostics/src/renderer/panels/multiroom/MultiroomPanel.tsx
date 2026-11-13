import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { BoolValue, Checkbox, CommandButton, CountPill, Icon, IconButton, ICONS, KeyValue, KeyValueList, MiddleTruncate, PanelBody, Pill, Section, StatusPill, TextInput } from '@/ui';
import { useDevices } from '@/state/devices';
import { useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { NotConnected, ResultBlock, Row } from '@/panels/sdk-shared';

type Candidate = {
    readonly uid: string;
    readonly label: string;
    readonly origin: 'output' | 'discovery' | 'manual';
    readonly leader: boolean;
    readonly local: boolean;
};

export function MultiroomPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const discovered = useDevices(state => state.devices);

    const [selected, setSelected] = useState<readonly string[]>([]);
    const [manual, setManual] = useState<readonly string[]>([]);
    const [manualUid, setManualUid] = useState('');

    const cluster = snapshot?.cluster ?? null;
    const outputDevices = snapshot?.outputDevices ?? [];

    const candidates = useMemo(() => {
        const entries: Candidate[] = outputDevices.map(output => ({uid: output.uid, label: output.name || output.uid, origin: 'output', leader: output.isGroupLeader, local: output.isLocal}));

        for (const device of discovered) {
            if (device.id !== deviceId && !entries.some(entry => entry.uid === device.id)) {
                entries.push({uid: device.id, label: device.name, origin: 'discovery', leader: false, local: false});
            }
        }

        for (const uid of manual) {
            if (!entries.some(entry => entry.uid === uid)) {
                entries.push({uid, label: uid, origin: 'manual', leader: false, local: false});
            }
        }

        return entries;
    }, [outputDevices, discovered, deviceId, manual]);

    const toggle = (uid: string, checked: boolean): void => {
        setSelected(current => (checked ? [...current, uid] : current.filter(entry => entry !== uid)));
    };

    const addManual = (): void => {
        const uid = manualUid.trim();

        if (uid.length > 0) {
            setManual(current => (current.includes(uid) ? current : [...current, uid]));
            setSelected(current => (current.includes(uid) ? current : [...current, uid]));
        }

        setManualUid('');
    };

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section
                title="Cluster"
                icon={ICONS.multiroom}
                actions={
                    <>
                        <StatusPill status={cluster?.isClusterAware ? 'ok' : 'off'}>{cluster?.isClusterAware ? 'cluster aware' : 'not cluster aware'}</StatusPill>
                        {cluster?.isLeader && <StatusPill status="accent" icon={ICONS.leader}>leader</StatusPill>}
                    </>
                }
            >
                <KeyValueList>
                    <KeyValue label="Cluster id" icon={ICONS.identifier}>{cluster?.clusterId ?? '-'}</KeyValue>
                    <KeyValue label="Leader" icon={ICONS.leader}>
                        <BoolValue value={cluster?.isLeader ?? false}/>
                    </KeyValue>
                    <KeyValue label="Cluster aware" icon={ICONS.multiroom}>
                        <BoolValue value={cluster?.isClusterAware ?? false}/>
                    </KeyValue>
                </KeyValueList>
                <Row>
                    <ResultBlock label="Cluster id" tooltip="multiroom.clusterId" run={() => call('device', 'multiroom.clusterId')} disabled={!connected}/>
                    <ResultBlock label="Leader" tooltip="multiroom.isLeader" run={() => call('device', 'multiroom.isLeader')} disabled={!connected}/>
                    <ResultBlock label="Cluster aware" tooltip="multiroom.isClusterAware" run={() => call('device', 'multiroom.isClusterAware')} disabled={!connected}/>
                    <ResultBlock label="Cluster type" tooltip="airplayState.clusterType" run={() => call('airplayState', 'clusterType')} disabled={!connected}/>
                </Row>
            </Section>

            <Section
                title="Group"
                icon={ICONS.outputDevice}
                actions={
                    <>
                        <CountPill>{`${selected.length} selected`}</CountPill>
                        <IconButton icon={X} label="Clear the selection" size="sm" disabled={selected.length === 0} onClick={() => setSelected([])}/>
                    </>
                }
            >
                {candidates.length === 0 ? (
                    <p className="text-xs text-text-muted">Nothing to offer. This device plays on itself and no other device was discovered; add a uid below.</p>
                ) : (
                    <div className="flex flex-col divide-y divide-border-soft">
                        {candidates.map(candidate => (
                            <div key={candidate.uid} className="flex items-center gap-2 py-1.5">
                                <Checkbox label={candidate.label} checked={selected.includes(candidate.uid)} onCheckedChange={checked => toggle(candidate.uid, checked)}/>
                                <span className="min-w-0 truncate text-xs text-text">{candidate.label}</span>
                                <MiddleTruncate text={candidate.uid} className="mono min-w-0 grow text-text-faint"/>
                                {candidate.leader && <Icon icon={ICONS.leader} size={14} className="shrink-0 text-accent"/>}
                                {candidate.local && <Icon icon={ICONS.local} size={14} className="shrink-0 text-text-faint"/>}
                                <Pill tone={candidate.origin === 'output' ? 'accent' : 'muted'}>{candidate.origin === 'output' ? 'in group' : candidate.origin === 'discovery' ? 'discovered' : 'typed'}</Pill>
                            </div>
                        ))}
                    </div>
                )}
                <Row>
                    <TextInput
                        label="Output device uid"
                        mono
                        className="h-7 w-72"
                        placeholder="Paste an output device uid"
                        value={manualUid}
                        onChange={event => setManualUid(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                addManual();
                            }
                        }}
                    />
                    <IconButton icon={Plus} label="Add the uid" size="sm" onClick={addManual}/>
                </Row>
                <Row>
                    <CommandButton label="Add to group" tooltip="multiroom.addDevice" run={() => call('device', 'multiroom.addDevice', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Remove from group" tooltip="multiroom.removeDevice" run={() => call('device', 'multiroom.removeDevice', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Set group" variant="primary" tooltip="multiroom.setDevices" run={() => call('device', 'multiroom.setDevices', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Set to none" variant="danger" tooltip="multiroom.setDevices([])" run={() => call('device', 'multiroom.setDevices', [])} disabled={!connected}/>
                </Row>
            </Section>
        </PanelBody>
    );
}
