import type { ReactNode } from 'react';
import { Dialog as BaseDialog } from '@base-ui-components/react/dialog';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

type DialogProps = {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly title: string;
    readonly description?: string;
    /* The buttons along the bottom, right aligned. */
    readonly footer?: ReactNode;
    readonly width?: number;
    readonly children: ReactNode;
};

/* The one dialog in the app: a backdrop, a titled header with a close button, a body and a footer. */
export function Dialog({open, onOpenChange, title, description, footer, width = 520, children}: DialogProps) {
    return (
        <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
            <BaseDialog.Portal>
                <BaseDialog.Backdrop className="dialog-backdrop"/>
                <BaseDialog.Popup className="dialog-popup flex flex-col" style={{width}}>
                    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
                        <BaseDialog.Title className="min-w-0 grow truncate text-sm font-medium">{title}</BaseDialog.Title>
                        <BaseDialog.Close render={<IconButton icon={X} label="Close" size="sm" tooltip={false}/>}/>
                    </header>
                    <div className={clsx('min-h-0 grow overflow-auto p-3', description && 'pt-2')}>
                        {description && <BaseDialog.Description className="mb-3 text-xs text-text-muted">{description}</BaseDialog.Description>}
                        {children}
                    </div>
                    {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-3">{footer}</footer>}
                </BaseDialog.Popup>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}
