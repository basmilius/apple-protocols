import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';

/** The RTSP verbs on the control stream, plus the two Protocol calls that ride on it. */
export function ControlStreamPanel({deviceId}: PanelProps) {
    return <RawConsole deviceId={deviceId} transport="controlStream" emptyText="The builder catalog could not be read from main."/>;
}
