import { useState, type ReactNode } from 'react';
import { Popover } from '@base-ui-components/react/popover';
import clsx from 'clsx';
import { Braces, TriangleAlert } from 'lucide-react';
import { messageOf } from '@/client';
import { Button } from './Button';
import { Icon } from './Icon';
import { JsonView } from './JsonView';

type CommandButtonProps = {
    readonly label: string;
    readonly run: () => Promise<unknown>;
    readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'positive';
    readonly size?: 'sm' | 'md';
    readonly icon?: ReactNode;
    readonly disabled?: boolean;
    readonly className?: string;
};

type Outcome = {
    readonly ok: boolean;
    readonly value: unknown;
};

/*
 * One command against a device. The button says what happened where it stands, and what came back
 * sits in a popover next to it, so a panel full of these does not need a result area of its own.
 */
export function CommandButton({label, run, variant = 'secondary', size = 'sm', icon, disabled, className}: CommandButtonProps) {
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [open, setOpen] = useState(false);

    const press = async (): Promise<void> => {
        setBusy(true);
        setOutcome(null);

        try {
            const value = await run();
            // A run that went through says nothing; only a value worth reading leaves a mark.
            setOutcome(value === undefined || value === null ? null : {ok: true, value});
        } catch (error) {
            setOutcome({ok: false, value: messageOf(error)});
            setOpen(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <span className={clsx('inline-flex items-center gap-1', className)}>
            <Button variant={variant} size={size} disabled={disabled || busy} onClick={() => void press()} className={busy ? 'opacity-60' : undefined}>
                {icon}
                {label}
            </Button>
            {outcome !== null && (
                <Popover.Root open={open} onOpenChange={setOpen}>
                    <Popover.Trigger
                        className={clsx('icon-btn h-6 w-6 cursor-default', outcome.ok ? 'text-text-faint hover:text-text' : 'text-status-error')}
                        aria-label={outcome.ok ? `${label} result` : `${label} failed`}
                    >
                        <Icon icon={outcome.ok ? Braces : TriangleAlert} size={14}/>
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-(--z-popup)">
                            <Popover.Popup className="menu-popup max-h-80 max-w-[480px] overflow-auto p-2 text-xs">
                                {outcome.ok ? <JsonView value={outcome.value} defaultDepth={2}/> : <p className="text-status-error">{String(outcome.value)}</p>}
                            </Popover.Popup>
                        </Popover.Positioner>
                    </Popover.Portal>
                </Popover.Root>
            )}
        </span>
    );
}
