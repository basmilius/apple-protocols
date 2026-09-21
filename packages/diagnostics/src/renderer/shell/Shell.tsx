import { useLayout } from '@/state/layout';
import { ErrorBoundary, TooltipProvider } from '@/ui';
import { ConsoleDock } from './ConsoleDock';
import { Sidebar, SIDEBAR_WIDTH } from './Sidebar';
import { SplitGrid } from './SplitGrid';
import { TopBar } from './TopBar';

/* The window: a sidebar, a top bar over the grid, and the log console on whichever edge it is
   docked to. */
export function Shell() {
    const sidebarOpen = useLayout(state => state.sidebarOpen);
    const consoleDock = useLayout(state => state.consoleDock);

    return (
        <TooltipProvider>
            <div className="flex h-full w-full overflow-hidden bg-bg">
                <div className="panel-shell h-full shrink-0 overflow-hidden" style={{width: sidebarOpen ? SIDEBAR_WIDTH : 0}}>
                    <Sidebar/>
                </div>
                <div className="flex min-w-0 grow flex-col">
                    <TopBar/>
                    <div className="flex min-h-0 grow">
                        <div className="flex min-w-0 grow flex-col">
                            <div className="relative min-h-0 grow">
                                <ErrorBoundary label="The grid failed to render">
                                    <SplitGrid/>
                                </ErrorBoundary>
                            </div>
                            {consoleDock === 'bottom' && <ConsoleDock/>}
                        </div>
                        {consoleDock === 'right' && <ConsoleDock/>}
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
