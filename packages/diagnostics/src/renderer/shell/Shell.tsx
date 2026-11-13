import { Workspace } from '@adecore/ui';
import { useLayout } from '@/state/layout';
import { WelcomePanel } from '@/panels/welcome/WelcomePanel';
import { ErrorBoundary } from '@/ui';
import { Rail } from './Rail';
import { SidePanel } from './SidePanel';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSelection } from './useSelection';

export function Shell() {
    const toolOpen = useLayout(state => state.tool !== null);
    const {device, sections, panel} = useSelection();
    const Panel = panel?.component ?? null;

    return (
        <Workspace
            className="h-full w-full"
            toolbar={<TopBar panel={panel}/>}
            // Without a device there are no panels to list, so the start screen takes the whole sheet.
            sidebar={device !== null && <Sidebar sections={sections} active={panel?.id ?? null}/>}
            sidePanel={<SidePanel/>}
            sidePanelWidth="auto"
            sidePanelOpen={toolOpen}
            rail={<Rail/>}
        >
            <div className="relative h-full overflow-hidden bg-surface">
                {device === null || Panel === null ? (
                    <WelcomePanel/>
                ) : (
                    // The key gives every device and panel a state of its own.
                    <ErrorBoundary key={`${device.id}::${panel?.id}`} label={`The ${panel?.title} panel failed to render`}>
                        <Panel deviceId={device.id}/>
                    </ErrorBoundary>
                )}
            </div>
        </Workspace>
    );
}
