import { useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, Volume1, Volume2, VolumeOff, VolumeX } from 'lucide-react';
import { ButtonGroup, CommandButton, CountPill, IconButton, ICONS, MiddleTruncate, PanelBody, Section, Select, type SelectItem, Slider, StatusPill, TextInput } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { Labeled, NotConnected, NumberInput, numberOf, ResultBlock, Row, VOLUME_ADJUSTMENT_ITEMS, VOLUME_ADJUSTMENTS, valueOf } from '@/panels/sdk-shared';

const toDevice = (percent: number): number => percent / 100;

/* Select items need a non-empty value; this one stands for "no output device given". */
const DEFAULT_OUTPUT = '-';

function OutputVolume({uid, name, volume, call, connected}: { readonly uid: string; readonly name: string; readonly volume: number; readonly call: DeviceCall; readonly connected: boolean }) {
    const [dragging, setDragging] = useState<number | null>(null);
    const level = dragging ?? Math.round(volume * 100);

    return (
        <div className="flex flex-col gap-1.5 py-2">
            <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-xs text-text">{name || uid}</span>
                <MiddleTruncate text={uid} className="mono min-w-0 grow text-text-faint"/>
                <ButtonGroup>
                    <IconButton icon={RefreshCw} label="Read the volume" size="sm" disabled={!connected} onClick={() => void call('device', 'volume.getForDevice', [uid])}/>
                    <IconButton icon={VolumeX} label="Mute" size="sm" disabled={!connected} onClick={() => void call('device', 'volume.muteDevice', [uid])}/>
                    <IconButton icon={Volume2} label="Unmute" size="sm" disabled={!connected} onClick={() => void call('device', 'volume.unmuteDevice', [uid])}/>
                </ButtonGroup>
            </div>
            <div className="flex items-center gap-3">
                <Slider
                    label={`Volume of ${name}`}
                    value={level}
                    disabled={!connected}
                    onValueChange={setDragging}
                    onValueCommitted={next => {
                        setDragging(null);
                        void call('device', 'volume.setForDevice', [uid, toDevice(next)]);
                    }}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{level}%</span>
            </div>
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
    const [adjustUid, setAdjustUid] = useState(DEFAULT_OUTPUT);
    const [audioMode, setAudioMode] = useState('default');
    const [listeningMode, setListeningMode] = useState('Default');
    const [fadeType, setFadeType] = useState('0');

    const volume = snapshot?.volume ?? null;
    const outputDevices = snapshot?.outputDevices ?? [];
    const shown = level ?? volume?.level ?? 0;

    const outputItems = useMemo<SelectItem<string>[]>(
        () => [{value: DEFAULT_OUTPUT, label: 'This device'}, ...outputDevices.map(output => ({value: output.uid, label: output.name || output.uid}))],
        [outputDevices]
    );

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <Section
                title="Volume"
                icon={ICONS.volume}
                actions={
                    <>
                        <StatusPill status={volume?.available ? 'ok' : 'off'}>{volume?.available ? 'available' : 'unavailable'}</StatusPill>
                        {volume?.muted && <StatusPill status="warning" icon={VolumeX}>muted</StatusPill>}
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
                    <ButtonGroup>
                        <IconButton icon={Volume1} label="Down" disabled={!connected} onClick={() => void call('device', 'volume.down')}/>
                        <IconButton icon={Volume2} label="Up" disabled={!connected} onClick={() => void call('device', 'volume.up')}/>
                    </ButtonGroup>
                    <ButtonGroup>
                        <IconButton icon={VolumeX} label="Mute" disabled={!connected} onClick={() => void call('device', 'volume.mute')}/>
                        <IconButton icon={Volume2} label="Unmute" disabled={!connected} onClick={() => void call('device', 'volume.unmute')}/>
                        <IconButton icon={VolumeOff} label="Toggle mute" disabled={!connected} onClick={() => void call('device', 'volume.toggleMute')}/>
                    </ButtonGroup>
                    <CommandButton label="Read" icon={RefreshCw} tooltip="volume.get" run={() => call('device', 'volume.get')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Fade and adjust" icon={TrendingDown}>
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
                        icon={TrendingDown}
                        tooltip="volume.fade"
                        run={() => call('device', 'volume.fade', [toDevice(numberOf(fadeTarget, 20)), numberOf(fadeDuration, 2000)])}
                        disabled={!connected}
                    />
                </Row>
                <Row>
                    <Select label="Adjustment" value={adjustment} onValueChange={setAdjustment} items={VOLUME_ADJUSTMENT_ITEMS} size="sm"/>
                    <Select label="Output device" value={adjustUid} onValueChange={setAdjustUid} items={outputItems} size="sm"/>
                    <CommandButton
                        label="Adjust"
                        tooltip="volume.adjust"
                        run={() => call('device', 'volume.adjust', adjustUid === DEFAULT_OUTPUT ? [valueOf(VOLUME_ADJUSTMENTS, adjustment)] : [valueOf(VOLUME_ADJUSTMENTS, adjustment), adjustUid])}
                        disabled={!connected}
                    />
                </Row>
            </Section>

            <Section wide title="Output devices" icon={ICONS.outputDevice} actions={<CountPill>{outputDevices.length}</CountPill>}>
                {outputDevices.length === 0 ? (
                    <p className="text-xs text-text-muted">The device reports no separate output devices.</p>
                ) : (
                    <div className="flex flex-col divide-y divide-border-soft">
                        {outputDevices.map(output => (
                            <OutputVolume key={output.uid} uid={output.uid} name={output.name} volume={output.volume} call={call} connected={connected}/>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Volume capabilities" icon={ICONS.info}>
                <Row>
                    <ResultBlock label="Capabilities" tooltip="airplayState.volumeCapabilities" run={() => call('airplayState', 'volumeCapabilities')} disabled={!connected}/>
                    <ResultBlock label="Available" tooltip="airplayState.volumeAvailable" run={() => call('airplayState', 'volumeAvailable')} disabled={!connected}/>
                    <ResultBlock label="Output device UID" tooltip="airplayState.outputDeviceUID" run={() => call('airplayState', 'outputDeviceUID')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Sound modes" icon={ICONS.experimental} collapsible defaultOpen={false}>
                <p className="text-xs text-text-muted">These go straight at the AirPlay manager. Most receivers answer only a subset, and a HomePod answers different ones than an Apple TV.</p>
                <Row>
                    <TextInput label="Audio mode" mono className="h-7 w-40" placeholder="default" value={audioMode} onChange={event => setAudioMode(event.target.value)}/>
                    <CommandButton label="Set audio mode" tooltip="airplay.setAudioMode" run={() => call('airplay', 'setAudioMode', [audioMode])} disabled={!connected}/>
                </Row>
                <Row>
                    <TextInput label="Listening mode" mono className="h-7 w-40" placeholder="Default" value={listeningMode} onChange={event => setListeningMode(event.target.value)}/>
                    <CommandButton label="Set listening mode" tooltip="airplay.setListeningMode" run={() => call('airplay', 'setListeningMode', [listeningMode])} disabled={!connected}/>
                </Row>
                <Row>
                    <Labeled label="Fade type">
                        <NumberInput label="Audio fade type" value={fadeType} onValueChange={setFadeType} className="w-14"/>
                    </Labeled>
                    <CommandButton label="Audio fade" tooltip="airplay.audioFade" run={() => call('airplay', 'audioFade', [numberOf(fadeType, 0)])} disabled={!connected}/>
                </Row>
                <Row>
                    <span className="text-xs text-text-muted">Conversation detection</span>
                    <ButtonGroup>
                        <CommandButton label="On" tooltip="airplay.setConversationDetectionEnabled(true)" run={() => call('airplay', 'setConversationDetectionEnabled', [true])} disabled={!connected}/>
                        <CommandButton label="Off" tooltip="airplay.setConversationDetectionEnabled(false)" run={() => call('airplay', 'setConversationDetectionEnabled', [false])} disabled={!connected}/>
                    </ButtonGroup>
                </Row>
            </Section>
        </PanelBody>
    );
}
