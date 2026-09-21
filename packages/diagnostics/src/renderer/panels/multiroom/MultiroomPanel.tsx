import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import { Badge, Button, CommandButton, Field, IconButton, KeyValue, KeyValueList, Section } from '@/ui';
import { useDevices } from '@/state/devices';
import { useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { Labeled, NotConnected, PanelBody, ResultBlock, Row } from '@/panels/sdk-shared';

type Candidate = {
    readonly uid: string;
    readonly label: string;
    readonly origin: 'output' | 'discovery';
};

export function MultiroomPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const discovered = useDevices(state => state.devices);

    const [selected, setSelected] = useState<readonly string[]>([]);
    const [manualUid, setManualUid] = useState('');

    const cluster = snapshot?.cluster ?? null;
    const outputDevices = snapshot?.outputDevices ?? [];

    const candidates = useMemo(() => {
        const entries: Candidate[] = outputDevices.map(output => ({uid: output.uid, label: output.name || output.uid, origin: 'output'}));

        for (const device of discovered) {
            if (device.id !== deviceId && !entries.some(entry => entry.uid === device.id)) {
                entries.push({uid: device.id, label: device.name, origin: 'discovery'});
            }
        }

        return entries;
    }, [outputDevices, discovered, deviceId]);

    const toggle = (uid: string): void => {
        setSelected(current => (current.includes(uid) ? current.filter(entry => entry !== uid) : [...current, uid]));
    };

    const addManual = (): void => {
        const uid = manualUid.trim();

        if (uid.length > 0 && !selected.includes(uid)) {
            setSelected([...selected, uid]);
        }

        setManualUid('');
    };

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section
                title="Cluster"
                actions={
                    <>
                        <Badge tone={cluster?.isClusterAware ? 'idle' : 'muted'}>{cluster?.isClusterAware ? 'cluster aware' : 'not cluster aware'}</Badge>
                        {cluster?.isLeader && <Badge tone="accent">leader</Badge>}
                    </>
                }
            >
                <KeyValueList>
                    <KeyValue label="Cluster id">{cluster?.clusterId ?? '-'}</KeyValue>
                    <KeyValue label="Is leader">{String(cluster?.isLeader ?? false)}</KeyValue>
                    <KeyValue label="Is cluster aware">{String(cluster?.isClusterAware ?? false)}</KeyValue>
                </KeyValueList>
                <Row>
                    <ResultBlock label="multiroom.clusterId" run={() => call('device', 'multiroom.clusterId')} disabled={!connected}/>
                    <ResultBlock label="multiroom.isLeader" run={() => call('device', 'multiroom.isLeader')} disabled={!connected}/>
                    <ResultBlock label="multiroom.isClusterAware" run={() => call('device', 'multiroom.isClusterAware')} disabled={!connected}/>
                    <ResultBlock label="airplayState.clusterType" run={() => call('airplayState', 'clusterType')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Output devices" actions={<Badge tone="muted">{outputDevices.length}</Badge>}>
                {outputDevices.length === 0 ? (
                    <p className="text-xs text-text-muted">This device reports no output devices, so it is playing on itself.</p>
                ) : (
                    <KeyValueList>
                        {outputDevices.map(output => (
                            <KeyValue key={output.uid} label={output.name || output.uid}>
                                {output.uid}
                                {output.isGroupLeader ? ' (leader)' : ''}
                                {output.isLocal ? ' (local)' : ''}
                            </KeyValue>
                        ))}
                    </KeyValueList>
                )}
            </Section>

            <Section title="Selection" actions={<Badge tone={selected.length > 0 ? 'accent' : 'muted'}>{`${selected.length} uid`}</Badge>}>
                <Row>
                    {candidates.map(candidate => (
                        <Button
                            key={candidate.uid}
                            size="sm"
                            variant={selected.includes(candidate.uid) ? 'primary' : 'ghost'}
                            className={clsx(candidate.origin === 'discovery' && 'italic')}
                            onClick={() => toggle(candidate.uid)}
                        >
                            {candidate.label}
                        </Button>
                    ))}
                    {candidates.length === 0 && <span className="text-xs text-text-muted">Nothing discovered to offer. Type a uid below.</span>}
                </Row>
                <Row>
                    <Labeled label="Uid">
                        <Field
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
                    </Labeled>
                    <IconButton icon={Plus} label="Add uid to the selection" size="sm" onClick={addManual}/>
                    <IconButton icon={X} label="Clear the selection" size="sm" onClick={() => setSelected([])}/>
                </Row>
                {selected.length > 0 && (
                    <Row>
                        {selected.map(uid => (
                            <Badge key={uid} tone="accent" mono>
                                {uid}
                            </Badge>
                        ))}
                    </Row>
                )}
                <Row>
                    <CommandButton label="Add devices" run={() => call('device', 'multiroom.addDevice', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Remove devices" run={() => call('device', 'multiroom.removeDevice', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Set devices" variant="primary" run={() => call('device', 'multiroom.setDevices', selected)} disabled={!connected || selected.length === 0}/>
                    <CommandButton label="Set to none" variant="danger" run={() => call('device', 'multiroom.setDevices', [])} disabled={!connected}/>
                </Row>
            </Section>
        </PanelBody>
    );
}
