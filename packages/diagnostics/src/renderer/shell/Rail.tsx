import { Check, Monitor, Moon, Sun, Terminal, type LucideIcon } from 'lucide-react';
import { WorkspaceRail, WorkspaceRailSeparator, WorkspaceRailSpacer } from '@adecore/ui';
import { CONSOLE_TOOL, useLayout } from '@/state/layout';
import { useTheme, type ThemePreference } from '@/state/theme';
import { TOOLS_PANELS } from '@/panels/registry.tools';
import { Icon, IconButton, Menu, MenuItem } from '@/ui';

const THEME_ITEMS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
    {value: 'light', label: 'Light', icon: Sun},
    {value: 'dark', label: 'Dark', icon: Moon},
    {value: 'system', label: 'System', icon: Monitor}
];

function ThemeMenu() {
    const preference = useTheme(state => state.preference);
    const resolved = useTheme(state => state.resolved);
    const setPreference = useTheme(state => state.setPreference);
    const icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

    return (
        <Menu side="left" align="end" trigger={<IconButton icon={icon} label="Theme" tooltipSide="left"/>}>
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

/** What belongs to no device: the log console and the tools, each a toggle for the side panel. */
export function Rail() {
    const tool = useLayout(state => state.tool);
    const toggleTool = useLayout(state => state.toggleTool);

    return (
        <WorkspaceRail>
            {/* On Windows and Linux the window's own buttons lie over this corner. macOS reports no title bar area. */}
            <span aria-hidden className="shrink-0" style={{height: 'env(titlebar-area-height, 0px)'}}/>
            <IconButton icon={Terminal} label="Log console" tooltipSide="left" active={tool === CONSOLE_TOOL} onClick={() => toggleTool(CONSOLE_TOOL)}/>
            <WorkspaceRailSeparator/>
            {TOOLS_PANELS.map(panel => (
                <IconButton key={panel.id} icon={panel.icon} label={panel.title} tooltipSide="left" active={tool === panel.id} onClick={() => toggleTool(panel.id)}/>
            ))}
            <WorkspaceRailSpacer/>
            <ThemeMenu/>
        </WorkspaceRail>
    );
}
