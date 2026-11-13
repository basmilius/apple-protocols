import { Select as DesktopSelect, type SelectItem as DesktopSelectItem, type SelectProps as DesktopSelectProps } from '@adecore/ui';

export type SelectItem<T extends string> = Readonly<DesktopSelectItem<T>>;

export type SelectGroup<T extends string> = {
    readonly label: string;
    readonly items: readonly SelectItem<T>[];
};

type SelectProps<T extends string> = Omit<DesktopSelectProps<T>, 'items'> & {
    readonly items: readonly SelectItem<T>[] | readonly SelectGroup<T>[];
};

export function Select<T extends string>({items, ...props}: SelectProps<T>) {
    const mutableItems = items.map(item => 'items' in item ? {...item, items: [...item.items]} : item);
    return <DesktopSelect {...props} items={mutableItems as DesktopSelectProps<T>['items']}/>;
}
