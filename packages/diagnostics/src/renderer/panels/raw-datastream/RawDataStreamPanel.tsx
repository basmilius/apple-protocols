import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';

export function RawDataStreamPanel({deviceId}: PanelProps) {
    return <RawConsole deviceId={deviceId} transport="dataStream" emptyText="The builder catalog could not be read from main."/>;
}
