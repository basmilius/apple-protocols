import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';

/** Every `DataStreamMessage` builder, including the ones nothing in the monorepo calls yet. */
export function RawDataStreamPanel({deviceId}: PanelProps) {
    return <RawConsole deviceId={deviceId} transport="dataStream" emptyText="The builder catalog could not be read from main."/>;
}
