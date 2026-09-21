import { useState } from 'react';
import clsx from 'clsx';
import { Badge, Button, CommandButton, SECTION_LABEL, Section, Select } from '@/ui';
import { useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { BUTTON_PRESS_ITEMS, COMPANION_HID_ITEMS, HID_PRESETS, Labeled, NotConnected, NumberInput, numberOf, PanelBody, Row, hex } from '@/panels/sdk-shared';
import { RemoteFace } from './RemoteFace';
import { TouchPad } from './TouchPad';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

/* The line between the remote and the raw controls underneath it. A `Section` header would read as
   one more block of buttons, and this one says that everything after it is of another kind. */
function AdvancedHeading() {
    return (
        <div className="flex items-center gap-2 pt-1">
            <h2 className={clsx(SECTION_LABEL, 'uppercase tracking-wide')}>Advanced</h2>
            <span aria-hidden className="h-px flex-1 bg-border"/>
        </div>
    );
}

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
    const hidPage = numberOf(page, 1);
    const hidUsage = numberOf(usage, 0);

    return (
        <PanelBody>
            {!connected && <NotConnected/>}

            <RemoteFace snapshot={snapshot} call={call} connected={connected} companionConnected={companionConnected}/>

            <Section title="Touch">
                <div className="flex flex-wrap items-start gap-6">
                    <TouchPad deviceId={deviceId} disabled={!companionConnected} finger={numberOf(finger, 1)}/>
                    <div className="flex flex-col gap-2">
                        <Labeled label="Finger">
                            <NumberInput label="Finger" value={finger} onValueChange={setFinger} className="w-14"/>
                        </Labeled>
                        <Labeled label="Swipe duration (ms)">
                            <NumberInput label="Swipe duration" value={swipeDuration} onValueChange={setSwipeDuration}/>
                        </Labeled>
                        <Row>
                            {DIRECTIONS.map(direction => (
                                <CommandButton
                                    key={direction}
                                    label={`Swipe ${direction}`}
                                    run={() => call('companionLink', 'swipe', [direction, numberOf(swipeDuration, 200)])}
                                    disabled={!companionConnected}
                                />
                            ))}
                        </Row>
                        <Row>
                            <CommandButton label="Tap (select)" run={() => call('companionLink', 'tap')} disabled={!companionConnected}/>
                        </Row>
                    </div>
                </div>
            </Section>

            <AdvancedHeading/>

            <Section title="Named commands">
                <div className="flex flex-col gap-2">
                    <Row>
                        <CommandButton label="Up" run={() => call('device', 'remote.up')} disabled={!connected}/>
                        <CommandButton label="Down" run={() => call('device', 'remote.down')} disabled={!connected}/>
                        <CommandButton label="Left" run={() => call('device', 'remote.left')} disabled={!connected}/>
                        <CommandButton label="Right" run={() => call('device', 'remote.right')} disabled={!connected}/>
                        <CommandButton label="Select" variant="primary" run={() => call('device', 'remote.select')} disabled={!connected}/>
                    </Row>
                    <Row>
                        <CommandButton label="Menu" run={() => call('device', 'remote.menu')} disabled={!connected}/>
                        <CommandButton label="Home" run={() => call('device', 'remote.home')} disabled={!connected}/>
                        <CommandButton label="Top menu" run={() => call('device', 'remote.topMenu')} disabled={!connected}/>
                    </Row>
                    <Row>
                        <CommandButton label="Play" run={() => call('device', 'remote.play')} disabled={!connected}/>
                        <CommandButton label="Pause" run={() => call('device', 'remote.pause')} disabled={!connected}/>
                        <CommandButton label="Play / pause" run={() => call('device', 'remote.playPause')} disabled={!connected}/>
                        <CommandButton label="Stop" run={() => call('device', 'remote.stop')} disabled={!connected}/>
                        <CommandButton label="Previous" run={() => call('device', 'remote.previous')} disabled={!connected}/>
                        <CommandButton label="Next" run={() => call('device', 'remote.next')} disabled={!connected}/>
                    </Row>
                    <Row>
                        <CommandButton label="Channel up" run={() => call('device', 'remote.channelUp')} disabled={!connected}/>
                        <CommandButton label="Channel down" run={() => call('device', 'remote.channelDown')} disabled={!connected}/>
                    </Row>
                    <Row>
                        <CommandButton label="Volume up" run={() => call('device', 'remote.volumeUp')} disabled={!connected}/>
                        <CommandButton label="Volume down" run={() => call('device', 'remote.volumeDown')} disabled={!connected}/>
                        <CommandButton label="Mute" run={() => call('device', 'remote.mute')} disabled={!connected}/>
                    </Row>
                    <Row>
                        <CommandButton label="Wake" run={() => call('device', 'remote.wake')} disabled={!connected}/>
                        <CommandButton label="Suspend" run={() => call('device', 'remote.suspend')} disabled={!connected} variant="danger"/>
                    </Row>
                </div>
            </Section>

            <Section title="HID primitives" actions={<Badge tone="muted" mono>{`page ${hidPage} / usage ${hex(hidUsage)}`}</Badge>}>
                <Row>
                    <Labeled label="Usage page">
                        <NumberInput label="Usage page" value={page} onValueChange={setPage} className="w-14"/>
                    </Labeled>
                    <Labeled label="Usage">
                        <NumberInput label="Usage" value={usage} onValueChange={setUsage}/>
                    </Labeled>
                    <Labeled label="Hold (ms)">
                        <NumberInput label="Hold duration" value={holdDuration} onValueChange={setHoldDuration}/>
                    </Labeled>
                </Row>
                <Row>
                    <CommandButton label="Press and release" run={() => call('device', 'remote.pressAndRelease', [hidPage, hidUsage])} disabled={!connected}/>
                    <CommandButton label="Long press" run={() => call('device', 'remote.longPress', [hidPage, hidUsage, numberOf(holdDuration, 1000)])} disabled={!connected}/>
                    <CommandButton label="Double press" run={() => call('device', 'remote.doublePress', [hidPage, hidUsage])} disabled={!connected}/>
                </Row>
                <Row>
                    {HID_PRESETS.map(preset => (
                        <Button
                            key={preset.name}
                            size="sm"
                            variant={preset.page === hidPage && preset.usage === hidUsage ? 'primary' : 'ghost'}
                            onClick={() => {
                                setPage(String(preset.page));
                                setUsage(hex(preset.usage));
                            }}
                        >
                            {preset.name}
                        </Button>
                    ))}
                </Row>
            </Section>

            {companionConnected && (
                <Section title="Companion Link keys" actions={<Badge tone="accent">companionLink</Badge>}>
                    <Row>
                        <Labeled label="Command">
                            <Select label="HID command" value={companionCommand} onValueChange={setCompanionCommand} items={COMPANION_HID_ITEMS} size="sm"/>
                        </Labeled>
                        <Labeled label="Press">
                            <Select label="Press type" value={companionType} onValueChange={setCompanionType} items={BUTTON_PRESS_ITEMS} size="sm"/>
                        </Labeled>
                        <Labeled label="Hold (ms)">
                            <NumberInput label="Companion hold" value={companionHold} onValueChange={setCompanionHold}/>
                        </Labeled>
                        <CommandButton
                            label="Press button"
                            variant="primary"
                            run={() => call('companionLink', 'pressButton', [companionCommand, companionType, numberOf(companionHold, 500)])}
                        />
                    </Row>
                    <Row>
                        {['Siri', 'Screensaver', 'Guide', 'Info', 'PageUp', 'PageDown', 'Power'].map(command => (
                            <CommandButton key={command} label={command} run={() => call('companionLink', 'pressButton', [command, companionType, numberOf(companionHold, 500)])}/>
                        ))}
                    </Row>
                    <Row>
                        <CommandButton label="Companion tap (select)" run={() => call('companionLink', 'tap')}/>
                        {DIRECTIONS.map(direction => (
                            <CommandButton key={direction} label={`CL swipe ${direction}`} run={() => call('companionLink', 'swipe', [direction, numberOf(swipeDuration, 200)])}/>
                        ))}
                    </Row>
                </Section>
            )}
        </PanelBody>
    );
}
