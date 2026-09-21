import clsx from 'clsx';
import { Check, Monitor, Moon, PanelBottom, PanelLeft, PanelLeftClose, PanelRight, Plug, PlugZap, Sun, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDevice } from '@/panels/hooks';
import { useLayout } from '@/state/layout';
import { useTheme, type ThemePreference } from '@/state/theme';
import { panelById } from '@/panels/registry';
import { Badge, BTN_GROUP, Button, ContextMenu, ContextMenuItem, Icon, Menu, MenuItem, Separator, shortcut, Tooltip } from '@/ui';
import { cellAt } from './split';

/* The traffic lights move under this bar as soon as the sidebar is out of the way. */
const TRAFFIC_LIGHT_INSET = 80;

const THEME_ITEMS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
    {value: 'light', label: 'Light', icon: Sun},
    {value: 'dark', label: 'Dark', icon: Moon},
    {value: 'system', label: 'System', icon: Monitor}
];

/* One button for the whole theme setting. The glyph is what the window looks like right now, which
   is the system's answer while the preference follows it. */
function ThemeMenu() {
    const preference = useTheme(state => state.preference);
    const resolved = useTheme(state => state.resolved);
    const setPreference = useTheme(state => state.setPreference);
    const icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

    return (
        <Menu
            align="end"
            trigger={
                <button type="button" aria-label="Theme" className="icon-btn cursor-default">
                    <Icon icon={icon} size={16}/>
                </button>
            }
        >
            {THEME_ITEMS.map(item => (
                <MenuItem key={item.value} onClick={() => setPreference(item.value)}>
                    <span className="grid size-4 shrink-0 place-items-center">{item.value === preference && <Icon icon={Check} size={14}/>}</span>
                    <Icon icon={item.icon} size={14}/>
                    {item.label}
                </MenuItem>
            ))}
        </Menu>
    );
}

/* The button opens and shuts the console; which edge it hangs from is a right click away, since
   that is a setting rather than the thing the button is for. */
function ConsoleButton() {
    const consoleOpen = useLayout(state => state.consoleOpen);
    const consoleDock = useLayout(state => state.consoleDock);
    const toggleConsole = useLayout(state => state.toggleConsole);
    const setConsoleDock = useLayout(state => state.setConsoleDock);

    return (
        <ContextMenu
            trigger={
                <button type="button" aria-label="Log console" data-active={String(consoleOpen)} className="icon-btn cursor-default" onClick={toggleConsole}>
                    <Icon icon={Terminal} size={16}/>
                </button>
            }
        >
            <ContextMenuItem onClick={() => setConsoleDock('right')}>
                <span className="grid size-4 shrink-0 place-items-center">{consoleDock === 'right' && <Icon icon={Check} size={14}/>}</span>
                <Icon icon={PanelRight} size={14}/>
                Dock to the right
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setConsoleDock('bottom')}>
                <span className="grid size-4 shrink-0 place-items-center">{consoleDock === 'bottom' && <Icon icon={Check} size={14}/>}</span>
                <Icon icon={PanelBottom} size={14}/>
                Dock to the bottom
            </ContextMenuItem>
        </ContextMenu>
    );
}

/* The band over the grid: which device and panel have the keyboard, what that device's connection
   is doing, and the two columns that slide in beside the grid. It drags the window, so everything
   in it that answers the pointer opts out of the drag region on its own. */
export function TopBar() {
    const layout = useLayout(state => state.layout);
    const sidebarOpen = useLayout(state => state.sidebarOpen);
    const toggleSidebar = useLayout(state => state.toggleSidebar);
    const cell = cellAt(layout, layout.focus);
    const panel = cell === null ? null : panelById(cell.panelId);
    const {device, snapshot, connected, busy, connect, disconnect} = useDevice(cell?.deviceId ?? null);

    return (
        <header
            className="app-drag flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 text-xs text-text-muted"
            style={sidebarOpen ? undefined : {paddingLeft: TRAFFIC_LIGHT_INSET}}
        >
            <Tooltip label={sidebarOpen ? 'Hide the sidebar' : 'Show the sidebar'} kbd={shortcut('Mod+B')}>
                <button
                    type="button"
                    aria-label={sidebarOpen ? 'Hide the sidebar' : 'Show the sidebar'}
                    /* Expanded rather than pressed: the icon already says which way it goes, and a
                       pressed toggle would sit filled for as long as the sidebar is open. */
                    aria-expanded={sidebarOpen}
                    className="icon-btn cursor-default"
                    onClick={toggleSidebar}
                >
                    <Icon icon={sidebarOpen ? PanelLeftClose : PanelLeft} size={16}/>
                </button>
            </Tooltip>
            <Separator/>
            <div className="flex min-w-0 grow items-center gap-2">
                {device && <span className="truncate text-sm font-medium text-text">{device.name}</span>}
                {device && panel && <span className="shrink-0 text-text-faint">/</span>}
                {panel && (
                    <span className="flex min-w-0 shrink-0 items-center gap-1.5">
                        <Icon icon={panel.icon} size={14}/>
                        <span className="truncate">{panel.title}</span>
                    </span>
                )}
            </div>
            {device && (
                <>
                    <Badge tone={connected ? 'idle' : 'muted'}>{snapshot?.connection.status ?? 'disconnected'}</Badge>
                    <Button
                        variant={connected ? 'secondary' : 'primary'}
                        size="sm"
                        disabled={busy}
                        onClick={() => void (connected ? disconnect() : connect())}
                    >
                        <Icon icon={connected ? Plug : PlugZap} size={14}/>
                        {connected ? 'Disconnect' : 'Connect'}
                    </Button>
                    <Separator/>
                </>
            )}
            <div className={clsx(BTN_GROUP, 'toolbar-overlay-inset')}>
                <ThemeMenu/>
                <ConsoleButton/>
            </div>
        </header>
    );
}
