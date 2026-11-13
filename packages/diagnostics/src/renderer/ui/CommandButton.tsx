import { useState } from 'react';
import { Button, Icon, Popover, ScrollArea, Tooltip } from '@adecore/ui';
import clsx from 'clsx';
import { Braces, type LucideIcon, TriangleAlert } from 'lucide-react';
import { messageOf } from '@/client';
import { JsonView } from './JsonView';

type CommandButtonProps = {
    readonly label: string;
    readonly run: () => Promise<unknown>;
    readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'positive';
    readonly size?: 'sm' | 'md';
    readonly icon?: LucideIcon;
    /* The call behind the label, such as `apps.openUrl`. */
    readonly tooltip?: string;
    /* Off where the caller shows the returned value itself; errors still open the popover. */
    readonly showResult?: boolean;
    readonly disabled?: boolean;
    readonly className?: string;
};

type Outcome = {
    readonly ok: boolean;
    readonly value: unknown;
};

/* Shows returned values and errors in a popover beside the command. */
export function CommandButton({label, run, variant = 'secondary', size = 'sm', icon, tooltip, showResult = true, disabled, className}: CommandButtonProps) {
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [open, setOpen] = useState(false);

    const press = async (): Promise<void> => {
        setBusy(true);
        setOutcome(null);

        try {
            const value = await run();
            setOutcome(!showResult || value === undefined || value === null ? null : {ok: true, value});
        } catch (error) {
            setOutcome({ok: false, value: messageOf(error)});
            setOpen(true);
        } finally {
            setBusy(false);
        }
    };

    const button = (
        <Button variant={variant} size={size} disabled={disabled || busy} onClick={() => void press()} className={busy ? 'opacity-60' : undefined}>
            {icon && <Icon icon={icon} size={14}/>}
            {label}
        </Button>
    );

    return (
        <span className={clsx('inline-flex items-center gap-1', className)}>
            {tooltip ? <Tooltip label={<span className="mono">{tooltip}</span>}>{button}</Tooltip> : button}
            {outcome !== null && (
                <Popover.Root open={open} onOpenChange={setOpen}>
                    <Popover.Trigger
                        className={clsx('icon-btn h-6 w-6 cursor-default', outcome.ok ? 'text-text-faint hover:text-text' : 'text-status-error')}
                        aria-label={outcome.ok ? `${label} result` : `${label} failed`}
                    >
                        <Icon icon={outcome.ok ? Braces : TriangleAlert} size={14}/>
                    </Popover.Trigger>
                    <Popover.Popup side="bottom" align="end" sideOffset={6} className="flex max-h-80 max-w-[480px] flex-col overflow-hidden p-0 text-xs">
                        <ScrollArea axis="both" viewportClassName="p-2">
                            {outcome.ok ? <JsonView value={outcome.value} defaultDepth={2}/> : <p className="text-status-error">{String(outcome.value)}</p>}
                        </ScrollArea>
                    </Popover.Popup>
                </Popover.Root>
            )}
        </span>
    );
}
