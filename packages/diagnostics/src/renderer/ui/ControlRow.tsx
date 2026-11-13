import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, Pill } from '@adecore/ui';

type ControlRowProps = {
    readonly label: string;
    readonly icon?: LucideIcon;
    /* The current state of what the row controls, shown right after the label. */
    readonly value?: ReactNode;
    readonly hint?: ReactNode;
    readonly children: ReactNode;
};

/**
 * One group of inputs with a label in front that says what they control. Every row keeps the same label column, so rows in a
 * card line up; in a card narrower than 480 pixels (the card is a container) the label stands above the controls.
 */
export function ControlRow({label, icon, value, hint, children}: ControlRowProps) {
    return (
        <div className="grid grid-cols-1 items-start gap-x-3 gap-y-1.5 @[480px]:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="flex min-h-7 min-w-0 items-center gap-1.5 text-xs text-text-muted">
                {icon && <Icon icon={icon} size={14} className="shrink-0 text-text-faint"/>}
                <span className="truncate">{label}</span>
                {value !== undefined && value !== null && (
                    <Pill tone="muted" className="shrink-0">
                        {value}
                    </Pill>
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-2">{children}</div>
                {hint && <p className="text-xs text-text-muted">{hint}</p>}
            </div>
        </div>
    );
}
