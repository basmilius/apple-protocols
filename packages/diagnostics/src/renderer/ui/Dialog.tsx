import type { ReactNode } from 'react';
import { Dialog as DesktopDialog, IconButton } from '@adecore/ui';
import clsx from 'clsx';
import { X } from 'lucide-react';

type DialogProps = {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly title: string;
    readonly description?: string;
    readonly footer?: ReactNode;
    readonly width?: number;
    readonly children: ReactNode;
};

export function Dialog({open, onOpenChange, title, description, footer, width = 520, children}: DialogProps) {
    return (
        <DesktopDialog.Root open={open} onOpenChange={onOpenChange}>
            <DesktopDialog.Popup className="flex flex-col" style={{width}}>
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
                    <DesktopDialog.Title className="min-w-0 grow truncate text-sm font-medium">{title}</DesktopDialog.Title>
                    <DesktopDialog.Close render={<IconButton icon={X} label="Close" size="sm" tooltip={false}/>}/>
                </header>
                <div className={clsx('min-h-0 grow overflow-auto p-3', description && 'pt-2')}>
                    {description && <DesktopDialog.Description size="xs" className="mb-3">{description}</DesktopDialog.Description>}
                    {children}
                </div>
                {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-3">{footer}</footer>}
            </DesktopDialog.Popup>
        </DesktopDialog.Root>
    );
}
