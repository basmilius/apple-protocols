import { useState } from 'react';
import { clampColumnSize, PanelHeader, SlidingColumn } from '@adecore/ui';
import { CONSOLE_TOOL, SIDE_PANEL_SIZE, useLayout } from '@/state/layout';
import { TOOLS_PANELS } from '@/panels/registry.tools';
import { ErrorBoundary } from '@/ui';
import { LogConsole } from './LogConsole';

function Tool({tool}: { readonly tool: string }) {
    const panel = TOOLS_PANELS.find(candidate => candidate.id === tool) ?? null;

    if (tool === CONSOLE_TOOL) {
        return <LogConsole/>;
    }

    if (panel === null) {
        return null;
    }

    return (
        <>
            <PanelHeader title={panel.title}/>
            <div className="relative min-h-0 grow overflow-hidden">
                <panel.component deviceId={null}/>
            </div>
        </>
    );
}

/** The rail's open tool, sliding in beside the sheet. It closes from its toggle in the rail. */
export function SidePanel() {
    const tool = useLayout(state => state.tool);
    const width = useLayout(state => state.sidePanelWidth);
    const setSidePanelWidth = useLayout(state => state.setSidePanelWidth);
    /* The column slides shut with its contents still in it, so the tool outlives its toggle. */
    const [shown, setShown] = useState(tool);

    if (tool !== null && tool !== shown) {
        setShown(tool);
    }

    return (
        <SlidingColumn open={tool !== null} edge={false} width={clampColumnSize(SIDE_PANEL_SIZE, width)} bounds={SIDE_PANEL_SIZE} onWidthChange={setSidePanelWidth}>
            {shown !== null && (
                <ErrorBoundary key={shown} label="This tool failed to render">
                    <Tool tool={shown}/>
                </ErrorBoundary>
            )}
        </SlidingColumn>
    );
}
