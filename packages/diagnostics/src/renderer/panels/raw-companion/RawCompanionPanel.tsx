import type { PanelProps } from '@/panels/registry';
import { RawConsole } from '@/panels/shared-media/RawConsole';

/** The Companion Link calls with no SDK path, plus a free-form OPack exchange. */
export function RawCompanionPanel({deviceId}: PanelProps) {
    return <RawConsole deviceId={deviceId} transport="companionLink" emptyText="The builder catalog could not be read from main."/>;
}
