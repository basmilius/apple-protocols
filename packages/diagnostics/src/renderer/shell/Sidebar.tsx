import clsx from 'clsx';
import { ListRow, ScrollArea, SectionLabel, WindowControlsSpacer } from '@adecore/ui';
import { useLayout } from '@/state/layout';
import type { PanelDefinition } from '@/panels/registry';
import { BRAND, Icon } from '@/ui';
import type { SelectionSection } from './useSelection';

function PanelRow({panel, active}: { readonly panel: PanelDefinition; readonly active: boolean }) {
    const show = useLayout(store => store.show);

    return (
        <ListRow
            variant="inset"
            selected={active}
            render={<button type="button" aria-current={active ? 'page' : undefined}/>}
            className={clsx('w-full cursor-default gap-2 text-left text-sm', active ? 'text-text' : 'text-text-muted hover:text-text')}
            onClick={() => show(panel.id)}
        >
            <span className="grid size-4 shrink-0 place-items-center">
                <Icon icon={panel.icon} size={14}/>
            </span>
            <span className="min-w-0 truncate">{panel.title}</span>
        </ListRow>
    );
}

/** The panels of the selected device. */
export function Sidebar({sections, active}: { readonly sections: readonly SelectionSection[]; readonly active: string | null }) {
    return (
        <nav aria-label="Panels" className="flex h-full flex-col">
            <div className="app-drag flex h-12 shrink-0 items-center pr-2">
                <WindowControlsSpacer/>
                <span className={clsx(BRAND, 'pointer-events-none pl-3')}>Diagnostics</span>
            </div>
            <ScrollArea className="min-h-0 grow" viewportClassName="flex flex-col gap-3 px-2 pb-2">
                {sections.map(section => (
                    <div key={section.title} className="flex flex-col gap-px">
                        <SectionLabel render={<h2/>} className="flex h-7 shrink-0 items-center px-2">{section.title}</SectionLabel>
                        {section.panels.map(panel => (
                            <PanelRow key={panel.id} panel={panel} active={panel.id === active}/>
                        ))}
                    </div>
                ))}
            </ScrollArea>
        </nav>
    );
}
