import { ArrowRight } from 'lucide-react';
import { useLayout } from '@/state/layout';
import { Button, Icon } from '@/ui';

/** Moves the selected device to another of its pages, for a summary that has more behind it. */
export function PanelLink({panel, label}: { readonly panel: string; readonly label: string }) {
    const show = useLayout(state => state.show);

    return (
        <Button variant="ghost" size="xs" onClick={() => show(panel)}>
            {label}
            <Icon icon={ArrowRight} size={12}/>
        </Button>
    );
}
