import { useState } from 'react';
import { Captions, Ear, Link2, MapPin, Mic, Package, Play, SunMoon, Tag } from 'lucide-react';
import { asCard, Banner, ButtonGroup, CommandButton, ControlRow, CountPill, EmptyState, IconButton, ICONS, PanelBody, PanelGroup, Section, TextInput } from '@/ui';
import { type DeviceCall, useDevice, useDeviceCall } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { EventFeed, NotConnected, ResultBlock, Row } from '@/panels/sdk-shared';

type LaunchableApp = {
    readonly bundleId: string;
    readonly name: string;
};

type UserAccount = {
    readonly accountId: string;
    readonly name: string;
};

type Context = {
    readonly call: DeviceCall;
    readonly connected: boolean;
};

const POWER_SOURCES = ['device', 'companionLink'] as const;
const POWER_EVENTS = ['power', 'attentionStateChanged'];

function AppsSection({call, connected}: Context) {
    const [apps, setApps] = useState<readonly LaunchableApp[]>([]);
    const [bundleId, setBundleId] = useState('');
    const [url, setUrl] = useState('');

    const list = async (): Promise<unknown> => {
        const result = (await call('device', 'apps.list')) as readonly LaunchableApp[];
        setApps(result ?? []);

        return result?.length ?? 0;
    };

    return (
        <Section
            title="Apps"
            icon={ICONS.apps}
            actions={
                <>
                    <CountPill>{apps.length}</CountPill>
                    <CommandButton label="List apps" tooltip="apps.list" run={list} showResult={false} disabled={!connected}/>
                </>
            }
        >
            {apps.length === 0 ? (
                <EmptyState icon={ICONS.apps}>Nothing listed yet.</EmptyState>
            ) : (
                <div className="flex max-h-72 flex-col divide-y divide-border-soft overflow-auto">
                    {apps.map(app => (
                        <div key={app.bundleId} className="flex items-center gap-2 py-1">
                            <span className="min-w-0 grow truncate text-xs text-text">{app.name}</span>
                            <span className="mono truncate text-text-faint">{app.bundleId}</span>
                            <IconButton icon={Play} label={`Launch ${app.name}`} size="sm" onClick={() => void call('device', 'apps.launch', [app.bundleId])}/>
                        </div>
                    ))}
                </div>
            )}
            <ControlRow label="Bundle identifier" icon={Package}>
                <TextInput label="Bundle identifier" mono className="h-7 min-w-0 flex-1 basis-40" placeholder="com.apple.TVMovies" value={bundleId} onChange={event => setBundleId(event.target.value)}/>
                <CommandButton label="Launch" tooltip="apps.launch" run={() => call('device', 'apps.launch', [bundleId.trim()])} disabled={!connected || bundleId.trim().length === 0}/>
            </ControlRow>
            <ControlRow label="URL" icon={Link2}>
                <TextInput label="URL to open" mono className="h-7 min-w-0 flex-1 basis-40" placeholder="https://tv.apple.com/..." value={url} onChange={event => setUrl(event.target.value)}/>
                <CommandButton label="Via AirPlay" tooltip="apps.openUrl" run={() => call('device', 'apps.openUrl', [url.trim()])} disabled={!connected || url.trim().length === 0}/>
                <CommandButton label="Via Companion Link" tooltip="companionLink.launchUrl" run={() => call('companionLink', 'launchUrl', [url.trim()])} disabled={!connected || url.trim().length === 0}/>
            </ControlRow>
        </Section>
    );
}

function AccountsSection({call, connected}: Context) {
    const [accounts, setAccounts] = useState<readonly UserAccount[]>([]);
    const [accountId, setAccountId] = useState('');
    const [dsid, setDsid] = useState('');

    const list = async (): Promise<unknown> => {
        const result = (await call('device', 'accounts.list')) as readonly UserAccount[];
        setAccounts(result ?? []);

        return result?.length ?? 0;
    };

    return (
        <Section
            title="Accounts"
            icon={ICONS.accounts}
            actions={
                <>
                    <CountPill>{accounts.length}</CountPill>
                    <CommandButton label="List accounts" tooltip="accounts.list" run={list} showResult={false} disabled={!connected}/>
                </>
            }
        >
            {accounts.length === 0 ? (
                <EmptyState icon={ICONS.accounts}>Nothing listed yet.</EmptyState>
            ) : (
                <div className="flex flex-col divide-y divide-border-soft">
                    {accounts.map(account => (
                        <div key={account.accountId} className="flex items-center gap-2 py-1">
                            <span className="min-w-0 grow truncate text-xs text-text">{account.name}</span>
                            <span className="mono truncate text-text-faint">{account.accountId}</span>
                            <CommandButton label="Switch" tooltip="accounts.switch" run={() => call('device', 'accounts.switch', [account.accountId])}/>
                        </div>
                    ))}
                </div>
            )}
            <Row>
                <ResultBlock label="Active account" tooltip="accounts.active" run={() => call('device', 'accounts.active')} disabled={!connected}/>
                <ResultBlock label="Companion account" tooltip="companionLink.activeUserAccount" run={() => call('companionLink', 'activeUserAccount')} disabled={!connected}/>
            </Row>
            <ControlRow label="Account id" icon={ICONS.identifier}>
                <TextInput label="Account identifier" mono className="h-7 min-w-0 flex-1 basis-40" value={accountId} onChange={event => setAccountId(event.target.value)}/>
                <CommandButton label="Switch" tooltip="accounts.switch" run={() => call('device', 'accounts.switch', [accountId.trim()])} disabled={!connected || accountId.trim().length === 0}/>
            </ControlRow>
            <ControlRow label="iCloud alt DSID" icon={ICONS.identifier}>
                <TextInput label="iCloud alt DSID" mono className="h-7 min-w-0 flex-1 basis-40" value={dsid} onChange={event => setDsid(event.target.value)}/>
                <CommandButton label="Switch" tooltip="accounts.switchActive" run={() => call('device', 'accounts.switchActive', [dsid.trim()])} disabled={!connected || dsid.trim().length === 0}/>
            </ControlRow>
        </Section>
    );
}

function OnOff({path, call, connected}: Context & { readonly path: string }) {
    return (
        <ButtonGroup>
            <CommandButton label="On" tooltip={`${path}(true)`} run={() => call('device', path, [true])} disabled={!connected}/>
            <CommandButton label="Off" tooltip={`${path}(false)`} run={() => call('device', path, [false])} disabled={!connected}/>
        </ButtonGroup>
    );
}

function SystemSection({call, connected}: Context) {
    return (
        <Section title="System" icon={ICONS.system}>
            <ControlRow label="Captions" icon={Captions}>
                <CommandButton label="Toggle" tooltip="system.toggleCaptions" run={() => call('device', 'system.toggleCaptions')} disabled={!connected}/>
            </ControlRow>
            <ControlRow label="Appearance" icon={SunMoon}>
                <ButtonGroup>
                    <CommandButton label="Light" tooltip="system.setAppearance" run={() => call('device', 'system.setAppearance', ['light'])} disabled={!connected}/>
                    <CommandButton label="Dark" tooltip="system.setAppearance" run={() => call('device', 'system.setAppearance', ['dark'])} disabled={!connected}/>
                </ButtonGroup>
            </ControlRow>
            <ControlRow label="Reduce loud sounds" icon={Ear}>
                <OnOff path="system.setReduceLoudSounds" call={call} connected={connected}/>
            </ControlRow>
            <ControlRow label="Finding mode" icon={MapPin}>
                <OnOff path="system.setFindingMode" call={call} connected={connected}/>
            </ControlRow>
            <ControlRow label="Siri" icon={Mic}>
                <ButtonGroup>
                    <CommandButton label="Start" tooltip="system.siriStart" run={() => call('device', 'system.siriStart')} disabled={!connected}/>
                    <CommandButton label="Stop" tooltip="system.siriStop" run={() => call('device', 'system.siriStop')} disabled={!connected}/>
                </ButtonGroup>
            </ControlRow>
        </Section>
    );
}

function PowerSection({call, connected}: Context) {
    return (
        <Section title="Power" icon={ICONS.power}>
            <ControlRow label="Power" icon={ICONS.power}>
                <CommandButton label="On" variant="primary" tooltip="power.on" run={() => call('device', 'power.on')} disabled={!connected}/>
                <CommandButton label="Off" variant="danger" tooltip="power.off" run={() => call('device', 'power.off')} disabled={!connected}/>
            </ControlRow>
            <Row>
                <ResultBlock label="Power state" tooltip="power.getState" run={() => call('device', 'power.getState')} disabled={!connected}/>
                <ResultBlock label="Attention state" tooltip="companionLink.getAttentionState" run={() => call('companionLink', 'getAttentionState')} disabled={!connected}/>
            </Row>
        </Section>
    );
}

function UpNextSection({call, connected}: Context) {
    const [identifier, setIdentifier] = useState('');
    const [kind, setKind] = useState('Movie');
    const [paginationToken, setPaginationToken] = useState('');
    const ready = connected && identifier.trim().length > 0;

    return (
        <Section title="Up next" icon={ICONS.upNext}>
            <ControlRow label="Pagination token" icon={ICONS.upNext} hint="Optional; leave empty for the first page.">
                <TextInput label="Pagination token" mono className="h-7 min-w-0 flex-1 basis-40" value={paginationToken} onChange={event => setPaginationToken(event.target.value)}/>
            </ControlRow>
            <ResultBlock
                label="Fetch up next"
                tooltip="system.fetchUpNext"
                run={() => call('device', 'system.fetchUpNext', paginationToken.trim().length > 0 ? [paginationToken.trim()] : [])}
                disabled={!connected}
                defaultDepth={3}
            />
            <ControlRow label="Item identifier" icon={ICONS.identifier}>
                <TextInput label="Up next identifier" mono className="h-7 min-w-0 flex-1 basis-40" value={identifier} onChange={event => setIdentifier(event.target.value)}/>
            </ControlRow>
            <ControlRow label="Kind" icon={Tag}>
                <TextInput label="Up next kind" mono className="h-7 w-32" value={kind} onChange={event => setKind(event.target.value)}/>
            </ControlRow>
            <Row>
                <CommandButton label="Add" tooltip="system.addToUpNext" run={() => call('device', 'system.addToUpNext', [identifier.trim(), kind.trim()])} disabled={!ready}/>
                <CommandButton label="Remove" variant="danger" tooltip="system.removeFromUpNext" run={() => call('device', 'system.removeFromUpNext', [identifier.trim(), kind.trim()])} disabled={!ready}/>
                <CommandButton label="Mark as watched" tooltip="companionLink.markAsWatched" run={() => call('companionLink', 'markAsWatched', [identifier.trim(), kind.trim()])} disabled={!ready}/>
            </Row>
        </Section>
    );
}

for (const card of [AppsSection, AccountsSection, SystemSection, PowerSection, UpNextSection]) {
    asCard(card);
}

export function AppleTVPanel({deviceId}: PanelProps) {
    const {snapshot, connected} = useDevice(deviceId);
    const call = useDeviceCall(deviceId);
    const companionConnected = snapshot?.connection.companionLink.connected === true;

    return (
        <PanelBody>
            {!connected && <NotConnected/>}
            {connected && !companionConnected && (
                <Banner placement="inline" tone="attention" icon={ICONS.companionLink} message="Companion Link is not connected, so apps, accounts, system and up next will refuse."/>
            )}

            <PanelGroup>
                <AppsSection call={call} connected={connected}/>
                <AccountsSection call={call} connected={connected}/>
                <UpNextSection call={call} connected={connected}/>
            </PanelGroup>

            <PanelGroup title="Power and system" icon={ICONS.power}>
                <PowerSection call={call} connected={connected}/>
                <SystemSection call={call} connected={connected}/>
                <EventFeed wide deviceId={deviceId} title="Power events" sources={POWER_SOURCES} names={POWER_EVENTS} empty="No power or attention event has come in yet." limit={10}/>
            </PanelGroup>
        </PanelBody>
    );
}
