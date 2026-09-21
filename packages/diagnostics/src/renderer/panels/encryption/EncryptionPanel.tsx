import type { PanelProps } from '@/panels/registry';
import { ToolboxPanel } from '@/panels/toolkit/ToolboxPanel';

/* Key pairs, ChaCha20 frames and the HKDF derivations this stack runs, with hex in and hex out. */
export function EncryptionPanel({deviceId}: PanelProps) {
    return <ToolboxPanel category="encryption" deviceId={deviceId}/>;
}
