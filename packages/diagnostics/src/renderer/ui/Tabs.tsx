import type { ReactNode } from 'react';
import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import clsx from 'clsx';

export type TabItem = {
    readonly value: string;
    readonly label: string;
    readonly icon?: ReactNode;
};

type TabsProps = {
    readonly value: string;
    readonly onValueChange: (value: string) => void;
    readonly items: readonly TabItem[];
    readonly label: string;
    readonly className?: string;
    readonly children: ReactNode;
};

export function Tabs({value, onValueChange, items, label, className, children}: TabsProps) {
    return (
        <BaseTabs.Root value={value} onValueChange={next => onValueChange(String(next))} className={clsx('flex min-h-0 flex-col', className)}>
            <BaseTabs.List aria-label={label} className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
                {items.map(item => (
                    <BaseTabs.Tab
                        key={item.value}
                        value={item.value}
                        className="relative inline-flex h-8 cursor-default items-center gap-1.5 rounded-md px-2 text-xs text-text-muted outline-none hover:text-text data-[selected]:text-text"
                    >
                        {item.icon}
                        {item.label}
                    </BaseTabs.Tab>
                ))}
                <BaseTabs.Indicator className="absolute bottom-0 left-0 h-px w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] bg-accent transition-all"/>
            </BaseTabs.List>
            {children}
        </BaseTabs.Root>
    );
}

export function TabPanel({value, className, children}: { readonly value: string; readonly className?: string; readonly children: ReactNode }) {
    return (
        <BaseTabs.Panel value={value} className={clsx('min-h-0 grow overflow-auto outline-none', className)}>
            {children}
        </BaseTabs.Panel>
    );
}
