import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';

export function RawCompanionPanel({deviceId}: PanelProps) {
    return <RawConsole deviceId={deviceId} transport="companionLink" emptyText="The builder catalog could not be read from main."/>;
}
