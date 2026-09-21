import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, CommandButton, Field, Icon, KeyValue, KeyValueList, Section, Select, Slider } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { Labeled, NotConnected, NumberInput, numberOf, PanelBody, ResultBlock, Row, VOLUME_ADJUSTMENT_ITEMS, VOLUME_ADJUSTMENTS, valueOf } from '@/panels/sdk-shared';

const toDevice = (percent: number): number => percent / 100;

function DeviceVolume({uid, name, volume, call}: { readonly uid: string; readonly name: string; readonly volume: number; readonly call: DeviceCall }) {
    const [dragging, setDragging] = useState<number | null>(null);
    const level = dragging ?? Math.round(volume * 100);

    return (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
            <div className="flex items-center gap-2">
                <span className="min-w-0 grow truncate text-xs text-text">{name || uid}</span>
                <Badge tone="muted" mono>{uid}</Badge>
            </div>
            <div className="flex items-center gap-3">
                <Slider
                    label={`Volume of ${name}`}
                    value={level}
                    onValueChange={setDragging}
                    onValueCommitted={next => {
                        setDragging(null);
                        void call('device', 'volume.setForDevice', [uid, toDevice(next)]);
                    }}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{level}%</span>
            </div>
            <Row>
                <CommandButton label="Get" run={() => call('device', 'volume.getForDevice', [uid])}/>
                <CommandButton label="Mute" run={() => call('device', 'volume.muteDevice', [uid])}/>
                <CommandButton label="Unmute" run={() => call('device', 'volume.unmuteDevice', [uid])}/>
            </Row>
        </div>
    );
}

export function VolumePanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const [level, setLevel] = useState<number | null>(null);
    const [fadeTarget, setFadeTarget] = useState('20');
    const [fadeDuration, setFadeDuration] = useState('2000');
    const [adjustment, setAdjustment] = useState('IncrementSmall');
    const [adjustUid, setAdjustUid] = useState('');
    const [audioMode, setAudioMode] = useState('default');
    const [listeningMode, setListeningMode] = useState('Default');
    const [fadeType, setFadeType] = useState('0');
    const [experimental, setExperimental] = useState(false);

    const volume = snapshot?.volume ?? null;
    const outputDevices = snapshot?.outputDevices ?? [];
    const shown = level ?? volume?.level ?? 0;

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section
                title="Volume"
                actions={
                    <>
                        <Badge tone={volume?.available ? 'idle' : 'muted'}>{volume?.available ? 'available' : 'unavailable'}</Badge>
                        {volume?.muted && <Badge tone="warning">muted</Badge>}
                    </>
                }
            >
                <div className="flex items-center gap-3">
                    <Slider
                        label="Volume"
                        value={shown}
                        disabled={!connected}
                        onValueChange={setLevel}
                        onValueCommitted={next => {
                            setLevel(null);
                            void call('device', 'volume.set', [toDevice(next)]);
                        }}
                    />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{shown}%</span>
                </div>
                <Row>
                    <CommandButton label="Get" run={() => call('device', 'volume.get')} disabled={!connected}/>
                    <CommandButton label="Up" run={() => call('device', 'volume.up')} disabled={!connected}/>
                    <CommandButton label="Down" run={() => call('device', 'volume.down')} disabled={!connected}/>
                    <CommandButton label="Mute" run={() => call('device', 'volume.mute')} disabled={!connected}/>
                    <CommandButton label="Unmute" run={() => call('device', 'volume.unmute')} disabled={!connected}/>
                    <CommandButton label="Toggle mute" run={() => call('device', 'volume.toggleMute')} disabled={!connected}/>
                </Row>
                <Row>
                    <Labeled label="Fade to (%)">
                        <NumberInput label="Fade target" value={fadeTarget} onValueChange={setFadeTarget}/>
                    </Labeled>
                    <Labeled label="Over (ms)">
                        <NumberInput label="Fade duration" value={fadeDuration} onValueChange={setFadeDuration}/>
                    </Labeled>
                    <CommandButton
                        label="Fade"
                        variant="primary"
                        run={() => call('device', 'volume.fade', [toDevice(numberOf(fadeTarget, 20)), numberOf(fadeDuration, 2000)])}
                        disabled={!connected}
                    />
                </Row>
                <Row>
                    <Labeled label="Adjust">
                        <Select label="Adjustment" value={adjustment} onValueChange={setAdjustment} items={VOLUME_ADJUSTMENT_ITEMS} size="sm"/>
                    </Labeled>
                    <Labeled label="Output uid">
                        <Field
                            label="Adjustment output device uid"
                            mono
                            className="h-7 w-56"
                            placeholder="Optional"
                            value={adjustUid}
                            onChange={event => setAdjustUid(event.target.value)}
                        />
                    </Labeled>
                    <CommandButton
                        label="Adjust"
                        run={() =>
                            call(
                                'device',
                                'volume.adjust',
                                adjustUid.trim().length > 0 ? [valueOf(VOLUME_ADJUSTMENTS, adjustment), adjustUid.trim()] : [valueOf(VOLUME_ADJUSTMENTS, adjustment)]
                            )
                        }
                        disabled={!connected}
                    />
                </Row>
            </Section>

            <Section title="Output devices" actions={<Badge tone="muted">{outputDevices.length}</Badge>}>
                {outputDevices.length === 0 ? (
                    <p className="text-xs text-text-muted">The device reports no separate output devices.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {outputDevices.map(output => (
                            <DeviceVolume key={output.uid} uid={output.uid} name={output.name} volume={output.volume} call={call}/>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Capabilities">
                <KeyValueList>
                    <KeyValue label="Level">{volume?.level ?? '-'}</KeyValue>
                    <KeyValue label="Available">{String(volume?.available ?? false)}</KeyValue>
                    <KeyValue label="Muted">{String(volume?.muted ?? false)}</KeyValue>
                </KeyValueList>
                <Row>
                    <ResultBlock label="volumeCapabilities" run={() => call('airplayState', 'volumeCapabilities')} disabled={!connected}/>
                    <ResultBlock label="volumeAvailable" run={() => call('airplayState', 'volumeAvailable')} disabled={!connected}/>
                    <ResultBlock label="outputDeviceUID" run={() => call('airplayState', 'outputDeviceUID')} disabled={!connected}/>
                </Row>
            </Section>

            <Section
                title="Experimental"
                actions={
                    <Button size="sm" variant="ghost" onClick={() => setExperimental(!experimental)}>
                        <Icon icon={experimental ? ChevronDown : ChevronRight} size={14}/>
                        {experimental ? 'Hide' : 'Show'}
                    </Button>
                }
            >
                {experimental && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-text-muted">These go straight at the AirPlay manager. Most receivers answer only a subset, and a HomePod answers different ones than an Apple TV.</p>
                        <Row>
                            <Labeled label="Audio mode">
                                <Field label="Audio mode" mono className="h-7 w-40" placeholder="default" value={audioMode} onChange={event => setAudioMode(event.target.value)}/>
                            </Labeled>
                            <CommandButton label="setAudioMode" run={() => call('airplay', 'setAudioMode', [audioMode])} disabled={!connected}/>
                        </Row>
                        <Row>
                            <Labeled label="Listening mode">
                                <Field label="Listening mode" mono className="h-7 w-40" placeholder="Default" value={listeningMode} onChange={event => setListeningMode(event.target.value)}/>
                            </Labeled>
                            <CommandButton label="setListeningMode" run={() => call('airplay', 'setListeningMode', [listeningMode])} disabled={!connected}/>
                        </Row>
                        <Row>
                            <Labeled label="Fade type">
                                <NumberInput label="Audio fade type" value={fadeType} onValueChange={setFadeType} className="w-14"/>
                            </Labeled>
                            <CommandButton label="audioFade" run={() => call('airplay', 'audioFade', [numberOf(fadeType, 0)])} disabled={!connected}/>
                        </Row>
                        <Row>
                            <CommandButton label="Conversation detection on" run={() => call('airplay', 'setConversationDetectionEnabled', [true])} disabled={!connected}/>
                            <CommandButton label="Conversation detection off" run={() => call('airplay', 'setConversationDetectionEnabled', [false])} disabled={!connected}/>
                        </Row>
                    </div>
                )}
            </Section>
        </PanelBody>
    );
}
