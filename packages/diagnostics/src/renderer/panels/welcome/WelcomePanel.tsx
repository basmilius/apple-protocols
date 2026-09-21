import { Monitor, MonitorSpeaker, Speaker } from 'lucide-react';
import type { DeviceType } from '@shared/contract';
import { useDevices } from '@/state/devices';
import { useLayout } from '@/state/layout';
import { TOOLS_PANELS } from '@/panels/registry.tools';
import { EmptyState, Icon, Kbd, Section, Tile } from '@/ui';

const TYPE_ICON: Record<DeviceType, typeof Monitor> = {
    appletv: Monitor,
    homepod: Speaker,
    'homepod-mini': Speaker,
    unknown: MonitorSpeaker
};

/* What an empty cell shows: everything that can fill it, one press away. A press anywhere in a cell
   moves the focus to it first, so `show` without a cell lands here. */
export function WelcomePanel() {
    const devices = useDevices(state => state.devices);
    const scanning = useDevices(state => state.scanning);
    const show = useLayout(state => state.show);

    return (
        <div className="flex h-full flex-col gap-5 overflow-auto p-4">
            <Section title="Devices">
                {devices.length === 0 ? (
                    <EmptyState icon={<Icon icon={MonitorSpeaker} size={20}/>}>
                        {scanning ? 'Looking for Apple TVs and HomePods.' : 'No devices found yet. Rescan in the sidebar to look again.'}
                    </EmptyState>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {devices.map(device => (
                            <Tile
                                key={device.id}
                                icon={<Icon icon={TYPE_ICON[device.deviceType]} size={16}/>}
                                title={device.name}
                                description={device.address}
                                onClick={() => show({deviceId: device.id, panelId: 'overview'})}
                            />
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Tools">
                <div className="grid grid-cols-2 gap-2">
                    {TOOLS_PANELS.map(panel => (
                        <Tile
                            key={panel.id}
                            size="sm"
                            icon={<Icon icon={panel.icon} size={14}/>}
                            title={panel.title}
                            onClick={() => show({deviceId: null, panelId: panel.id})}
                        />
                    ))}
                </div>
            </Section>

            <p className="flex flex-wrap items-center gap-2 text-2xs text-text-faint">
                <Kbd>Mod+\</Kbd>
                splits right
                <Kbd>Mod+Shift+\</Kbd>
                splits down
            </p>
        </div>
    );
}
