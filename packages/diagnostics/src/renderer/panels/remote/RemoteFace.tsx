import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Music, Pause } from 'lucide-react';
import type { StateSnapshot } from '@shared/contract';
import { Badge, Icon, Kbd, Segmented, type SegmentedItem } from '@/ui';
import type { DeviceCall } from '@/panels/hooks';
import { FACE_COMMANDS, type Gesture, KEY_BINDINGS, POWER_COMMAND, type Transport } from './commands';
import { DPad } from './DPad';
import { RemoteButton } from './RemoteButton';
import type { RegisterTrigger } from './press';

const TRANSPORTS: readonly SegmentedItem<Transport>[] = [
    {value: 'airplay', label: 'AirPlay HID'},
    {value: 'companionLink', label: 'Companion Link'}
];

const HINTS: readonly { readonly keys: readonly string[]; readonly label: string; readonly appleTvOnly?: boolean }[] = [
    {keys: ['↑', '↓', '←', '→'], label: 'navigate', appleTvOnly: true},
    {keys: ['Enter'], label: 'select', appleTvOnly: true},
    {keys: ['Esc'], label: 'menu', appleTvOnly: true},
    {keys: ['H'], label: 'home', appleTvOnly: true},
    {keys: ['Space'], label: 'play or pause'},
    {keys: ['+', '-'], label: 'volume'},
    {keys: ['M'], label: 'mute'}
];

type RemoteFaceProps = {
    readonly snapshot: StateSnapshot | null;
    readonly call: DeviceCall;
    readonly connected: boolean;
    readonly companionConnected: boolean;
};

export function RemoteFace({snapshot, call, connected, companionConnected}: RemoteFaceProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggers = useRef(new Map<string, (gesture: Gesture) => void>());

    const [transport, setTransport] = useState<Transport>('airplay');
    const [focused, setFocused] = useState(false);

    const deviceType = snapshot?.device?.deviceType ?? 'unknown';
    const isAppleTv = deviceType !== 'homepod' && deviceType !== 'homepod-mini';
    const nowPlaying = snapshot?.nowPlaying ?? null;
    const playing = nowPlaying?.playbackState.toLowerCase() === 'playing';

    const commands = useMemo(() => FACE_COMMANDS.filter(command => isAppleTv || command.appleTvOnly !== true), [isAppleTv]);
    const hints = useMemo(() => HINTS.filter(hint => isAppleTv || hint.appleTvOnly !== true), [isAppleTv]);

    useEffect(() => {
        if (!companionConnected) {
            setTransport('airplay');
        }
    }, [companionConnected]);

    const register = useCallback<RegisterTrigger>((id, trigger) => {
        triggers.current.set(id, trigger);

        return () => {
            if (triggers.current.get(id) === trigger) {
                triggers.current.delete(id);
            }
        };
    }, []);

    /* Ignore bubbled events from keys and fields that handle their own activation. */
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.target !== event.currentTarget || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        const trigger = triggers.current.get(KEY_BINDINGS[event.key] ?? '');

        if (trigger === undefined) {
            return;
        }

        event.preventDefault();
        trigger('tap');
    };

    const title = nowPlaying?.title || nowPlaying?.appName || 'Nothing playing';
    const meta = [nowPlaying?.artist, nowPlaying?.album].filter(part => (part ?? '') !== '').join(' • ');

    return (
        <div className="@container">
            <div
                ref={rootRef}
                tabIndex={0}
                role="group"
                aria-label="Remote"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onPointerDownCapture={() => rootRef.current?.focus()}
                onKeyDown={onKeyDown}
                className={clsx('flex flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-4 shadow-float outline-none', focused && 'ring-2 ring-accent')}
            >
                <header className="flex items-center gap-3">
                    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-sunken">
                        {nowPlaying?.artworkUrl ? <img src={nowPlaying.artworkUrl} alt="" className="size-full object-cover"/> : <Icon icon={Music} size={20} className="text-text-faint"/>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{title}</span>
                        <span className="truncate text-xs text-text-muted">{meta === '' ? (nowPlaying?.appName ?? '-') : meta}</span>
                    </div>
                    <Badge tone={playing ? 'idle' : 'muted'}>{nowPlaying?.playbackState || 'unknown'}</Badge>
                    {isAppleTv && <RemoteButton command={POWER_COMMAND} transport={transport} call={call} disabled={!connected} register={register}/>}
                </header>

                {companionConnected && <Segmented<Transport> label="Transport" value={transport} onValueChange={setTransport} items={TRANSPORTS}/>}

                <div className="flex flex-col items-center gap-5 @[480px]:flex-row @[480px]:gap-8">
                    {isAppleTv && <DPad transport={transport} call={call} disabled={!connected} register={register}/>}
                    <div className="grid grid-cols-3 gap-2">
                        {commands.map(command => (
                            <RemoteButton
                                key={command.id}
                                command={command}
                                icon={command.id === 'playPause' && playing ? Pause : undefined}
                                transport={transport}
                                call={call}
                                disabled={!connected}
                                register={register}
                            />
                        ))}
                    </div>
                </div>

                <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs', focused ? 'text-text-muted' : 'text-text-faint')}>
                    {!focused && <span>Click the remote to use these keys.</span>}
                    {hints.map(hint => (
                        <span key={hint.label} className="inline-flex items-center gap-1">
                            {hint.keys.map(key => (
                                <Kbd key={key}>{key}</Kbd>
                            ))}
                            {hint.label}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1">hold a key for its long press</span>
                </div>
            </div>
        </div>
    );
}
