import type { PanelProps } from '@/panels/registry';
import { ToolboxPanel } from '@/panels/toolkit/ToolboxPanel';

/* OPack, plist, TLV8, DAAP, NSKeyedArchiver and NTP, decoded and encoded by hand. */
export function EncodingPanel({deviceId}: PanelProps) {
    return <ToolboxPanel category="encoding" deviceId={deviceId}/>;
}
