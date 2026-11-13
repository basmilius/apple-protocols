import type { LucideIcon } from 'lucide-react';
import { Segmented as DesktopSegmented } from '@adecore/ui';

export type SegmentedItem<T extends string> = {
    readonly value: T;
    readonly label: string;
    readonly icon?: LucideIcon;
};

type SegmentedProps<T extends string> = {
    readonly value: T;
    readonly onValueChange: (value: T) => void;
    readonly items: readonly SegmentedItem<T>[];
    readonly label: string;
    readonly className?: string;
};

export function Segmented<T extends string>({items, ...props}: SegmentedProps<T>) {
    return <DesktopSegmented {...props} options={items.map(({value, ...item}) => ({id: value, ...item}))}/>;
}
