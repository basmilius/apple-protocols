import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, SquareArrowOutUpRight } from 'lucide-react';
import { ListRow } from '@adecore/ui';
import type { DeviceEventSource } from '@shared/contract';
import { formatTime } from '@shared/helpers';
import { useLayout } from '@/state/layout';
import { useDeviceEvents } from '@/panels/hooks';
import { CountPill, Icon, IconButton, ICONS, JsonView, Section } from '@/ui';

type EventFeedProps = {
    readonly deviceId: string | null;
    readonly title: string;
    readonly empty: string;
    readonly sources?: readonly DeviceEventSource[];
    readonly names?: readonly string[];
    readonly limit?: number;
    readonly wide?: boolean;
};

/** The newest events of one kind on the page that causes them, with the full list one click away in Events. */
export function EventFeed({deviceId, title, empty, sources, names, limit = 20, wide}: EventFeedProps) {
    const showEvents = useLayout(state => state.showEvents);
    const events = useDeviceEvents(deviceId, {sources, names, limit});
    const feed = useMemo(() => [...events].reverse(), [events]);
    const [open, setOpen] = useState<number | null>(null);

    return (
        <Section
            wide={wide}
            title={title}
            icon={ICONS.events}
            actions={
                <>
                    <CountPill>{feed.length}</CountPill>
                    <IconButton icon={SquareArrowOutUpRight} label="Open in Events" size="sm" onClick={() => showEvents({sources, names})}/>
                </>
            }
        >
            {feed.length === 0 ? (
                <p className="text-xs text-text-muted">{empty}</p>
            ) : (
                <div className="-mx-2 flex max-h-64 flex-col gap-px overflow-auto">
                    {feed.map(event => (
                        <div key={event.sequence}>
                            <ListRow
                                variant="inset"
                                selected={open === event.sequence}
                                render={<button type="button" aria-expanded={open === event.sequence}/>}
                                className="w-full cursor-default gap-2 text-left"
                                onClick={() => setOpen(open === event.sequence ? null : event.sequence)}
                            >
                                <Icon icon={open === event.sequence ? ChevronDown : ChevronRight} size={12} className="shrink-0 text-text-faint"/>
                                <span className="mono shrink-0 text-code-dim">{formatTime(event.timestamp)}</span>
                                <span className="min-w-0 truncate text-xs text-text">{event.name}</span>
                            </ListRow>
                            {open === event.sequence && (
                                <div className="mx-2 my-1 rounded-lg bg-code-bg px-2 py-1.5">
                                    <JsonView value={event.payload} defaultDepth={2}/>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Section>
    );
}
