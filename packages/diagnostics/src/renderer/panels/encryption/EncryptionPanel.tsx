import type { PanelProps } from '@/panels/registry';
import { ToolboxPanel } from '@/panels/toolkit/ToolboxPanel';

export function EncryptionPanel({deviceId}: PanelProps) {
    return <ToolboxPanel category="encryption" deviceId={deviceId}/>;
}
