import type { PanelProps } from '@/panels/registry';
import { ToolboxPanel } from '@/panels/toolkit/ToolboxPanel';

export function EncodingPanel({deviceId}: PanelProps) {
    return <ToolboxPanel category="encoding" deviceId={deviceId}/>;
}
