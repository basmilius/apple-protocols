import { useMemo, useState } from 'react';
import { formatTime } from '@shared/helpers';
import { Badge, CommandButton, EmptyState, Field, JsonView, KeyValue, KeyValueList, Section, Select, TabPanel, Tabs, TextArea } from '@/ui';
import type { TabItem } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall, useDeviceEvents } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { BUTTON_PRESS_ITEMS, Labeled, MEDIA_CONTROL_ITEMS, NotConnected, NumberInput, numberOf, PanelBody, ResultBlock, Row } from '@/panels/sdk-shared';

const TABS: readonly TabItem[] = [
    {value: 'apps', label: 'Apps'},
    {value: 'accounts', label: 'Accounts'},
    {value: 'keyboard', label: 'Keyboard'},
    {value: 'power', label: 'Power'},
    {value: 'system', label: 'System'},
    {value: 'companion', label: 'Companion'}
];

type LaunchableApp = {
    readonly bundleId: string;
    readonly name: string;
};

type UserAccount = {
    readonly accountId: string;
    readonly name: string;
};

function EventFeed({events, empty}: { readonly events: readonly { readonly sequence: number; readonly timestamp: number; readonly name: string; readonly payload: readonly unknown[] }[]; readonly empty: string }) {
    const feed = useMemo(() => [...events].reverse(), [events]);

    return (
        <div className="max-h-56 overflow-auto rounded-lg border border-border bg-code-bg p-2">
            {feed.length === 0 ? (
                <p className="text-xs text-text-muted">{empty}</p>
            ) : (
                feed.map(event => (
                    <div key={event.sequence} className="border-b border-border-soft py-1 last:border-b-0">
                        <div className="flex items-center gap-2">
                            <span className="mono text-code-dim">{formatTime(event.timestamp)}</span>
                            <span className="text-xs text-text">{event.name}</span>
                        </div>
                        <JsonView value={event.payload} defaultDepth={2}/>
                    </div>
                ))
            )}
        </div>
    );
}

function AppsTab({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [apps, setApps] = useState<readonly LaunchableApp[]>([]);
    const [bundleId, setBundleId] = useState('');
    const [url, setUrl] = useState('');

    const list = async (): Promise<unknown> => {
        const result = (await call('device', 'apps.list')) as readonly LaunchableApp[];
        setApps(result ?? []);

        return result?.length ?? 0;
    };

    return (
        <PanelBody>
            <Section title="Launchable apps" actions={<Badge tone="muted">{apps.length}</Badge>}>
                <Row>
                    <CommandButton label="List apps" run={list} disabled={!connected}/>
                    <Labeled label="Bundle id">
                        <Field label="Bundle identifier" mono className="h-7 w-72" placeholder="com.apple.TVMovies" value={bundleId} onChange={event => setBundleId(event.target.value)}/>
                    </Labeled>
                    <CommandButton label="Launch" variant="primary" run={() => call('device', 'apps.launch', [bundleId.trim()])} disabled={!connected || bundleId.trim().length === 0}/>
                </Row>
                {apps.length === 0 ? (
                    <EmptyState className="py-4">Nothing listed yet.</EmptyState>
                ) : (
                    <div className="flex flex-col divide-y divide-border-soft">
                        {apps.map(app => (
                            <div key={app.bundleId} className="flex items-center gap-2 py-1">
                                <span className="min-w-0 grow truncate text-xs text-text">{app.name}</span>
                                <Badge tone="muted" mono>
                                    {app.bundleId}
                                </Badge>
                                <CommandButton label="Launch" run={() => call('device', 'apps.launch', [app.bundleId])}/>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Open URL">
                <Row>
                    <Field label="URL to open" mono className="h-7 w-96" placeholder="https://tv.apple.com/..." value={url} onChange={event => setUrl(event.target.value)}/>
                    <CommandButton label="apps.openUrl" run={() => call('device', 'apps.openUrl', [url.trim()])} disabled={!connected || url.trim().length === 0}/>
                    <CommandButton label="companionLink.launchUrl" run={() => call('companionLink', 'launchUrl', [url.trim()])} disabled={!connected || url.trim().length === 0}/>
                </Row>
            </Section>
        </PanelBody>
    );
}

function AccountsTab({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [accounts, setAccounts] = useState<readonly UserAccount[]>([]);
    const [accountId, setAccountId] = useState('');
    const [dsid, setDsid] = useState('');

    const list = async (): Promise<unknown> => {
        const result = (await call('device', 'accounts.list')) as readonly UserAccount[];
        setAccounts(result ?? []);

        return result?.length ?? 0;
    };

    return (
        <PanelBody>
            <Section title="User accounts" actions={<Badge tone="muted">{accounts.length}</Badge>}>
                <Row>
                    <CommandButton label="List accounts" run={list} disabled={!connected}/>
                    <ResultBlock label="accounts.active" run={() => call('device', 'accounts.active')} disabled={!connected}/>
                </Row>
                {accounts.length === 0 ? (
                    <EmptyState className="py-4">Nothing listed yet.</EmptyState>
                ) : (
                    <div className="flex flex-col divide-y divide-border-soft">
                        {accounts.map(account => (
                            <div key={account.accountId} className="flex items-center gap-2 py-1">
                                <span className="min-w-0 grow truncate text-xs text-text">{account.name}</span>
                                <Badge tone="muted" mono>
                                    {account.accountId}
                                </Badge>
                                <CommandButton label="Switch" run={() => call('device', 'accounts.switch', [account.accountId])}/>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Switch by identifier">
                <Row>
                    <Labeled label="Account id">
                        <Field label="Account identifier" mono className="h-7 w-72" value={accountId} onChange={event => setAccountId(event.target.value)}/>
                    </Labeled>
                    <CommandButton label="accounts.switch" run={() => call('device', 'accounts.switch', [accountId.trim()])} disabled={!connected || accountId.trim().length === 0}/>
                </Row>
                <Row>
                    <Labeled label="iCloud alt DSID">
                        <Field label="iCloud alt DSID" mono className="h-7 w-72" value={dsid} onChange={event => setDsid(event.target.value)}/>
                    </Labeled>
                    <CommandButton label="accounts.switchActive" run={() => call('device', 'accounts.switchActive', [dsid.trim()])} disabled={!connected || dsid.trim().length === 0}/>
                </Row>
            </Section>
        </PanelBody>
    );
}

function KeyboardTab({deviceId, call, connected}: { readonly deviceId: string | null; readonly call: DeviceCall; readonly connected: boolean }) {
    const {snapshot} = useDevice(deviceId);
    const [text, setText] = useState('');
    const events = useDeviceEvents(deviceId, {sources: ['device', 'companionLink'], names: ['textInput', 'textInputChanged'], limit: 50});

    const keyboard = snapshot?.keyboard ?? null;

    return (
        <PanelBody>
            <Section title="Text input" actions={<Badge tone={keyboard?.active ? 'accent' : 'muted'}>{keyboard?.active ? 'keyboard active' : 'idle'}</Badge>}>
                <KeyValueList>
                    <KeyValue label="Text" mono={false}>
                        {keyboard?.text ?? '-'}
                    </KeyValue>
                    <KeyValue label="Placeholder" mono={false}>
                        {keyboard?.placeholder ?? '-'}
                    </KeyValue>
                </KeyValueList>
                <TextArea label="Text to send" rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="What to type on the device"/>
                <Row>
                    <CommandButton label="Type" variant="primary" run={() => call('device', 'keyboard.type', [text])} disabled={!connected}/>
                    <CommandButton label="Append" run={() => call('device', 'keyboard.append', [text])} disabled={!connected}/>
                    <CommandButton label="Clear" variant="danger" run={() => call('device', 'keyboard.clear')} disabled={!connected}/>
                </Row>
                <Row>
                    <ResultBlock label="keyboard.getSession" run={() => call('device', 'keyboard.getSession')} disabled={!connected} defaultDepth={3}/>
                    <ResultBlock label="airplayState.keyboardState" run={() => call('airplayState', 'keyboardState')} disabled={!connected}/>
                    <ResultBlock label="airplayState.keyboardAttributes" run={() => call('airplayState', 'keyboardAttributes')} disabled={!connected} defaultDepth={3}/>
                </Row>
            </Section>

            <Section title="Text input events" actions={<Badge tone="muted">{events.length}</Badge>}>
                <EventFeed events={events} empty="No text input event has come in yet."/>
            </Section>
        </PanelBody>
    );
}

function PowerTab({deviceId, call, connected}: { readonly deviceId: string | null; readonly call: DeviceCall; readonly connected: boolean }) {
    const events = useDeviceEvents(deviceId, {sources: ['device', 'companionLink'], names: ['power', 'attentionStateChanged'], limit: 50});

    return (
        <PanelBody>
            <Section title="Power">
                <Row>
                    <CommandButton label="Power on" variant="primary" run={() => call('device', 'power.on')} disabled={!connected}/>
                    <CommandButton label="Power off" variant="danger" run={() => call('device', 'power.off')} disabled={!connected}/>
                </Row>
                <Row>
                    <ResultBlock label="power.getState" run={() => call('device', 'power.getState')} disabled={!connected}/>
                    <ResultBlock label="companionLink.getAttentionState" run={() => call('companionLink', 'getAttentionState')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Power events" actions={<Badge tone="muted">{events.length}</Badge>}>
                <EventFeed events={events} empty="No power or attention event has come in yet."/>
            </Section>
        </PanelBody>
    );
}

function SystemTab({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [identifier, setIdentifier] = useState('');
    const [kind, setKind] = useState('Movie');
    const [paginationToken, setPaginationToken] = useState('');

    return (
        <PanelBody>
            <Section title="System">
                <Row>
                    <CommandButton label="Toggle captions" run={() => call('device', 'system.toggleCaptions')} disabled={!connected}/>
                    <CommandButton label="Appearance light" run={() => call('device', 'system.setAppearance', ['light'])} disabled={!connected}/>
                    <CommandButton label="Appearance dark" run={() => call('device', 'system.setAppearance', ['dark'])} disabled={!connected}/>
                </Row>
                <Row>
                    <CommandButton label="Reduce loud sounds on" run={() => call('device', 'system.setReduceLoudSounds', [true])} disabled={!connected}/>
                    <CommandButton label="Reduce loud sounds off" run={() => call('device', 'system.setReduceLoudSounds', [false])} disabled={!connected}/>
                    <CommandButton label="Finding mode on" run={() => call('device', 'system.setFindingMode', [true])} disabled={!connected}/>
                    <CommandButton label="Finding mode off" run={() => call('device', 'system.setFindingMode', [false])} disabled={!connected}/>
                </Row>
                <Row>
                    <CommandButton label="Siri start" run={() => call('device', 'system.siriStart')} disabled={!connected}/>
                    <CommandButton label="Siri stop" run={() => call('device', 'system.siriStop')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Up next">
                <Row>
                    <Labeled label="Pagination token">
                        <Field label="Pagination token" mono className="h-7 w-56" placeholder="Optional" value={paginationToken} onChange={event => setPaginationToken(event.target.value)}/>
                    </Labeled>
                </Row>
                <ResultBlock
                    label="system.fetchUpNext"
                    run={() => call('device', 'system.fetchUpNext', paginationToken.trim().length > 0 ? [paginationToken.trim()] : [])}
                    disabled={!connected}
                    defaultDepth={3}
                />
                <Row>
                    <Labeled label="Identifier">
                        <Field label="Up next identifier" mono className="h-7 w-56" value={identifier} onChange={event => setIdentifier(event.target.value)}/>
                    </Labeled>
                    <Labeled label="Kind">
                        <Field label="Up next kind" mono className="h-7 w-32" value={kind} onChange={event => setKind(event.target.value)}/>
                    </Labeled>
                    <CommandButton label="Add to up next" run={() => call('device', 'system.addToUpNext', [identifier.trim(), kind.trim()])} disabled={!connected || identifier.trim().length === 0}/>
                    <CommandButton
                        label="Remove from up next"
                        variant="danger"
                        run={() => call('device', 'system.removeFromUpNext', [identifier.trim(), kind.trim()])}
                        disabled={!connected || identifier.trim().length === 0}
                    />
                    <CommandButton label="Mark as watched" run={() => call('companionLink', 'markAsWatched', [identifier.trim(), kind.trim()])} disabled={!connected || identifier.trim().length === 0}/>
                </Row>
            </Section>
        </PanelBody>
    );
}

function CompanionTab({call, connected}: { readonly call: DeviceCall; readonly connected: boolean }) {
    const [command, setCommand] = useState('Play');
    const [content, setContent] = useState('');
    const [contentError, setContentError] = useState<string | null>(null);
    const [pressType, setPressType] = useState('SingleTap');
    const [holdDelay, setHoldDelay] = useState('500');

    const send = async (): Promise<unknown> => {
        const trimmed = content.trim();
        setContentError(null);

        if (trimmed.length === 0) {
            return await call('companionLink', 'mediaControlCommand', [command]);
        }

        try {
            return await call('companionLink', 'mediaControlCommand', [command, JSON.parse(trimmed)]);
        } catch (error) {
            setContentError(error instanceof Error ? error.message : String(error));
            throw error;
        }
    };

    return (
        <PanelBody>
            <Section title="Companion Link manager">
                <Row>
                    <ResultBlock label="fetchNowPlayingInfo" run={() => call('companionLink', 'fetchNowPlayingInfo')} disabled={!connected} defaultDepth={3}/>
                    <ResultBlock label="fetchSupportedActions" run={() => call('companionLink', 'fetchSupportedActions')} disabled={!connected} defaultDepth={3}/>
                    <ResultBlock label="fetchMediaControlStatus" run={() => call('companionLink', 'fetchMediaControlStatus')} disabled={!connected} defaultDepth={3}/>
                </Row>
                <Row>
                    <ResultBlock label="textInputState" run={() => call('companionLink', 'textInputState')} disabled={!connected} defaultDepth={3}/>
                    <ResultBlock label="activeUserAccount" run={() => call('companionLink', 'activeUserAccount')} disabled={!connected}/>
                </Row>
            </Section>

            <Section title="Media control command">
                <Row>
                    <Select label="Media control command" value={command} onValueChange={setCommand} items={MEDIA_CONTROL_ITEMS} size="sm"/>
                    <CommandButton label="Send" variant="primary" run={send} disabled={!connected}/>
                </Row>
                <Field label="Command content as JSON" mono className="h-7" placeholder='Content as JSON, for example {"volume":0.5}' value={content} onChange={event => setContent(event.target.value)}/>
                {contentError !== null && <p className="text-xs text-status-error">{contentError}</p>}
            </Section>

            <Section title="Button press defaults">
                <Row>
                    <Labeled label="Press">
                        <Select label="Press type" value={pressType} onValueChange={setPressType} items={BUTTON_PRESS_ITEMS} size="sm"/>
                    </Labeled>
                    <Labeled label="Hold (ms)">
                        <NumberInput label="Hold delay" value={holdDelay} onValueChange={setHoldDelay}/>
                    </Labeled>
                    <CommandButton label="Siri" run={() => call('companionLink', 'pressButton', ['Siri', pressType, numberOf(holdDelay, 500)])} disabled={!connected}/>
                    <CommandButton label="Home" run={() => call('companionLink', 'pressButton', ['Home', pressType, numberOf(holdDelay, 500)])} disabled={!connected}/>
                </Row>
            </Section>
        </PanelBody>
    );
}

export function AppleTVPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const [tab, setTab] = useState('apps');

    const companionConnected = snapshot?.connection.companionLink.connected === true;

    return (
        <div className="flex h-full min-h-0 flex-col">
            {!connected && <NotConnected/>}
            {connected && !companionConnected && (
                <p className="px-4 pt-3 text-xs text-status-needs-you">Companion Link is not connected, so apps, accounts, system and the companion tab will refuse.</p>
            )}
            <Tabs value={tab} onValueChange={setTab} items={TABS} label="Apple TV" className="min-h-0 grow">
                <TabPanel value="apps">
                    <AppsTab call={call} connected={connected}/>
                </TabPanel>
                <TabPanel value="accounts">
                    <AccountsTab call={call} connected={connected}/>
                </TabPanel>
                <TabPanel value="keyboard">
                    <KeyboardTab deviceId={deviceId} call={call} connected={connected}/>
                </TabPanel>
                <TabPanel value="power">
                    <PowerTab deviceId={deviceId} call={call} connected={connected}/>
                </TabPanel>
                <TabPanel value="system">
                    <SystemTab call={call} connected={connected}/>
                </TabPanel>
                <TabPanel value="companion">
                    <CompanionTab call={call} connected={connected}/>
                </TabPanel>
            </Tabs>
        </div>
    );
}
