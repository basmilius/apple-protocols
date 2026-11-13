import { useEffect, useMemo, useState } from 'react';
import type { RawTransport } from '@shared/contract';
import { useDevice } from '@/panels/hooks';
import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';
import { ICONS, Segmented, type SegmentedItem } from '@/ui';

const TRANSPORTS: readonly (SegmentedItem<RawTransport> & { readonly needs: 'airplay' | 'companionLink' })[] = [
    {value: 'dataStream', label: 'Data stream', icon: ICONS.airplay, needs: 'airplay'},
    {value: 'companionLink', label: 'Companion Link', icon: ICONS.companionLink, needs: 'companionLink'},
    {value: 'controlStream', label: 'Control stream', icon: ICONS.raw, needs: 'airplay'}
];

export function RawPanel({deviceId}: PanelProps) {
    const {device} = useDevice(deviceId);
    const [transport, setTransport] = useState<RawTransport>('dataStream');

    const items = useMemo(() => TRANSPORTS.filter(item => device?.services[item.needs] != null), [device]);

    useEffect(() => {
        if (items.length > 0 && !items.some(item => item.value === transport)) {
            setTransport(items[0].value);
        }
    }, [items, transport]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
                <Segmented<RawTransport> label="Transport" value={transport} onValueChange={setTransport} items={items}/>
            </header>
            <div className="min-h-0 grow">
                <RawConsole deviceId={deviceId} transport={transport} emptyText="The builder catalog could not be read from main."/>
            </div>
        </div>
    );
}
