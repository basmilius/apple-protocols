import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, ChevronUp, Circle, LayoutGrid, type LucideIcon, Pause, Play, Square } from 'lucide-react';
import { asCard, Button, ButtonGroup, CommandButton, ControlRow, CountPill, IconButton, ICONS, KeyValue, KeyValueList, PanelGroup, Section, Select, StatusPill, TextArea } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { BUTTON_PRESS_ITEMS, COMPANION_HID_ITEMS, EventFeed, HID_PRESETS, NotConnected, NumberInput, numberOf, PanelBody, ResultBlock, Row, hex } from '@/panels/sdk-shared';
import { keyOf } from './commands';
import { RemoteFace } from './RemoteFace';
import { TouchPad } from './TouchPad';

const SWIPES = [
    {direction: 'up', icon: ChevronUp},
    {direction: 'down', icon: ChevronDown},
    {direction: 'left', icon: ChevronLeft},
    {direction: 'right', icon: ChevronRight}
] as const;

/* The face covers navigation, transport, volume and power; these are the remote keys it has no button for. */
const EXTRA_KEYS: readonly { readonly label: string; readonly path: string; readonly icon: LucideIcon }[] = [
    {label: 'Top menu', path: 'remote.topMenu', icon: LayoutGrid},
    {label: 'Channel up', path: 'remote.channelUp', icon: ChevronsUp},
    {label: 'Channel down', path: 'remote.channelDown', icon: ChevronsDown},
    {label: 'Play', path: 'remote.play', icon: Play},
    {label: 'Pause', path: 'remote.pause', icon: Pause},
    {label: 'Stop', path: 'remote.stop', icon: Square}
];

const COMPANION_SHORTCUTS = ['Siri', 'Screensaver', 'Guide', 'Info', 'PageUp', 'PageDown', 'Power'];
const TEXT_INPUT_SOURCES = ['state', 'companionLink'] as const;
const TEXT_INPUT_EVENTS = ['text.change', 'textInputChanged'];

function TextInputSection({deviceId, call, connected, companionConnected}: { readonly deviceId: string | null; readonly call: DeviceCall; readonly connected: boolean; readonly companionConnected: boolean }) {
    const {snapshot} = useDevice(deviceId);
    const [text, setText] = useState('');
    const keyboard = snapshot?.keyboard ?? null;

    return (
        <Section title="Text input" icon={ICONS.keyboard} actions={<StatusPill status={keyboard?.active ? 'accent' : 'off'}>{keyboard?.active ? 'keyboard active' : 'idle'}</StatusPill>}>
            <KeyValueList>
                <KeyValue label="Text" mono={false}>
                    {keyboard?.text || '-'}
                </KeyValue>
                <KeyValue label="Placeholder" mono={false}>
                    {keyboard?.placeholder || '-'}
                </KeyValue>
            </KeyValueList>
            <TextArea label="Text to send" rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="What to type on the device"/>
            <Row>
                <CommandButton label="Type" variant="primary" tooltip="text.set" run={() => call('device', 'text.set', [text])} disabled={!connected}/>
                <CommandButton label="Append" tooltip="text.append" run={() => call('device', 'text.append', [text])} disabled={!connected}/>
                <CommandButton label="Clear" variant="danger" tooltip="text.clear" run={() => call('device', 'text.clear')} disabled={!connected}/>
            </Row>
            <Row>
                <ResultBlock label="Session" tooltip="text.state" run={() => call('device', 'text.state')} disabled={!connected} defaultDepth={3}/>
                <ResultBlock label="State" tooltip="airplayState.keyboardState" run={() => call('airplayState', 'keyboardState')} disabled={!connected}/>
                <ResultBlock label="Attributes" tooltip="airplayState.keyboardAttributes" run={() => call('airplayState', 'keyboardAttributes')} disabled={!connected} defaultDepth={3}/>
                <ResultBlock label="Companion state" tooltip="companionLink.textInputState" run={() => call('companionLink', 'state.textInputState')} disabled={!companionConnected} defaultDepth={3}/>
            </Row>
        </Section>
    );
}

asCard(TextInputSection);

export function RemotePanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);

    const [finger, setFinger] = useState('1');
    const [swipeDuration, setSwipeDuration] = useState('200');
    const [page, setPage] = useState('1');
    const [usage, setUsage] = useState('0x8c');
    const [holdDuration, setHoldDuration] = useState('1000');
    const [companionCommand, setCompanionCommand] = useState('Select');
    const [companionType, setCompanionType] = useState('SingleTap');
    const [companionHold, setCompanionHold] = useState('500');

    const companionConnected = snapshot?.connection.companionLink.connected === true;
    const deviceType = snapshot?.device?.deviceType ?? 'unknown';
    const isAppleTv = deviceType !== 'homepod' && deviceType !== 'homepod-mini';
    const hidPage = numberOf(page, 1);
    const hidUsage = numberOf(usage, 0);

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <PanelGroup>
                <RemoteFace snapshot={snapshot} call={call} connected={connected} companionConnected={companionConnected}/>

                {isAppleTv && (
                    <Section title="Touch" icon={ICONS.touch} actions={!companionConnected && <StatusPill status="off" icon={ICONS.companionLink}>needs Companion Link</StatusPill>}>
                        <TouchPad deviceId={deviceId} disabled={!companionConnected} finger={numberOf(finger, 1)}/>
                        <ControlRow label="Finger" icon={ICONS.touch}>
                            <NumberInput label="Finger" value={finger} onValueChange={setFinger} className="w-14"/>
                        </ControlRow>
                        <ControlRow label="Swipe (ms)" icon={ChevronRight}>
                            <NumberInput label="Swipe duration in milliseconds" value={swipeDuration} onValueChange={setSwipeDuration}/>
                            <ButtonGroup>
                                {SWIPES.map(swipe => (
                                    <IconButton
                                        key={swipe.direction}
                                        icon={swipe.icon}
                                        label={`Swipe ${swipe.direction}`}
                                        disabled={!companionConnected}
                                        onClick={() => void call('device', 'touch.swipe', [swipe.direction, numberOf(swipeDuration, 200)])}
                                    />
                                ))}
                                <IconButton icon={Circle} label="Tap to select" disabled={!companionConnected} onClick={() => void call('device', 'touch.tap')}/>
                            </ButtonGroup>
                        </ControlRow>
                    </Section>
                )}

                {isAppleTv && <TextInputSection deviceId={deviceId} call={call} connected={connected} companionConnected={companionConnected}/>}
                {isAppleTv && <EventFeed wide deviceId={deviceId} title="Text input events" sources={TEXT_INPUT_SOURCES} names={TEXT_INPUT_EVENTS} empty="No text input event has come in yet." limit={10}/>}
            </PanelGroup>

            <PanelGroup title="Advanced" icon={ICONS.advanced}>
                <Section title="Extra keys" icon={ICONS.remote} collapsible defaultOpen={false}>
                    <Row>
                        {EXTRA_KEYS.map(key => (
                            <CommandButton key={key.path} label={key.label} icon={key.icon} tooltip={key.path} run={() => call('device', 'remote.press', [keyOf(key.path)])} disabled={!connected}/>
                        ))}
                    </Row>
                </Section>

                <Section title="HID primitives" icon={ICONS.advanced} collapsible defaultOpen={false} actions={<CountPill>{`page ${hidPage} / usage ${hex(hidUsage)}`}</CountPill>}>
                    <ControlRow label="Usage page" icon={ICONS.advanced}>
                        <NumberInput label="Usage page" value={page} onValueChange={setPage} className="w-14"/>
                    </ControlRow>
                    <ControlRow label="Usage" icon={ICONS.advanced} hint="Decimal, or hex with 0x.">
                        <NumberInput label="Usage" value={usage} onValueChange={setUsage}/>
                    </ControlRow>
                    <ControlRow label="Hold (ms)" icon={ICONS.timing}>
                        <NumberInput label="Hold duration in milliseconds" value={holdDuration} onValueChange={setHoldDuration}/>
                    </ControlRow>
                    <Row>
                        <CommandButton label="Press and release" tooltip="airplay.hid.press" run={() => call('airplay', 'hid.press', [hidPage, hidUsage])} disabled={!connected}/>
                        <CommandButton label="Long press" tooltip="airplay.hid.longPress" run={() => call('airplay', 'hid.longPress', [hidPage, hidUsage, numberOf(holdDuration, 1000)])} disabled={!connected}/>
                        <CommandButton label="Double press" tooltip="airplay.hid.doublePress" run={() => call('airplay', 'hid.doublePress', [hidPage, hidUsage])} disabled={!connected}/>
                    </Row>
                    <ControlRow label="Presets" icon={ICONS.remote}>
                        {HID_PRESETS.map(preset => (
                            <Button
                                key={preset.name}
                                size="sm"
                                variant={preset.page === hidPage && preset.usage === hidUsage ? 'primary' : 'secondary'}
                                onClick={() => {
                                    setPage(String(preset.page));
                                    setUsage(hex(preset.usage));
                                }}
                            >
                                {preset.name}
                            </Button>
                        ))}
                    </ControlRow>
                </Section>

                {companionConnected && (
                    <Section title="Companion Link keys" icon={ICONS.companionLink} collapsible defaultOpen={false}>
                        <ControlRow label="Press" icon={ICONS.remote}>
                            <Select label="Press type" value={companionType} onValueChange={setCompanionType} items={BUTTON_PRESS_ITEMS} size="sm"/>
                        </ControlRow>
                        <ControlRow label="Hold (ms)" icon={ICONS.timing}>
                            <NumberInput label="Companion hold in milliseconds" value={companionHold} onValueChange={setCompanionHold}/>
                        </ControlRow>
                        <ControlRow label="Key" icon={ICONS.companionLink}>
                            <Select label="HID command" value={companionCommand} onValueChange={setCompanionCommand} items={COMPANION_HID_ITEMS} size="sm"/>
                            <CommandButton
                                label="Press"
                                variant="primary"
                                tooltip="companionLink.hid.press"
                                run={() => call('companionLink', 'hid.press', [companionCommand, companionType, numberOf(companionHold, 500)])}
                            />
                        </ControlRow>
                        <ControlRow label="Shortcuts" icon={ICONS.companionLink}>
                            {COMPANION_SHORTCUTS.map(command => (
                                <CommandButton key={command} label={command} run={() => call('companionLink', 'hid.press', [command, companionType, numberOf(companionHold, 500)])}/>
                            ))}
                        </ControlRow>
                    </Section>
                )}
            </PanelGroup>
        </PanelBody>
    );
}
