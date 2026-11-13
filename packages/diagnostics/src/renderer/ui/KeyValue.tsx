import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Icon, KeyValueList as List } from '@adecore/ui';

type KeyValueProps = {
    readonly label: string;
    readonly icon?: LucideIcon;
    readonly children: ReactNode;
    readonly mono?: boolean;
    readonly className?: string;
};

/** One row of a {@link KeyValueList}; outside one the label and value stack. */
export function KeyValue({label, icon, children, mono = true, className}: KeyValueProps) {
    return (
        <List.Item className={className}>
            <List.Name className="flex items-center gap-1.5">
                {icon && <Icon icon={icon} size={12} className="shrink-0"/>}
                {label}
            </List.Name>
            <List.Value mono={mono} className={clsx('min-w-0 break-all text-text', !mono && 'text-xs')}>
                {children}
            </List.Value>
        </List.Item>
    );
}

export function KeyValueList({divided = true, className, children}: { readonly divided?: boolean; readonly className?: string; readonly children: ReactNode }) {
    return (
        <List.Root divided={divided} className={className}>
            {children}
        </List.Root>
    );
}
