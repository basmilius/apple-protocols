import { Monitor, MonitorSpeaker, Speaker, type LucideIcon } from 'lucide-react';
import type { DeviceSessionStatus, DeviceType, DiscoveredDeviceInfo } from '@shared/contract';
import { Icon } from '@/ui';

const TYPE_ICON: Record<DeviceType, LucideIcon> = {
    appletv: Monitor,
    homepod: Speaker,
    'homepod-mini': Speaker,
    unknown: MonitorSpeaker
};

const SESSION_COLOR: Record<DeviceSessionStatus, string | undefined> = {
    disconnected: undefined,
    connecting: 'text-status-needs-you',
    connected: 'text-status-idle',
    recovering: 'text-status-needs-you',
    failed: 'text-status-error'
};

/** The mark of a device type, in the color of its session so a row needs no separate status dot. */
export function DeviceIcon({device, size = 14}: { readonly device: Pick<DiscoveredDeviceInfo, 'deviceType' | 'session'>; readonly size?: number }) {
    return <Icon icon={TYPE_ICON[device.deviceType]} size={size} className={SESSION_COLOR[device.session]}/>;
}
