import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '@adecore/ui';
import { Section } from './Section';

const CARD = Symbol.for('diagnostics.card');

type Segment = {
    readonly key: string;
    readonly cards: ReactNode[] | null;
    readonly span: ReactNode;
};

/** Marks a component that renders one card, so a {@link PanelBody} flows it through the columns like a `Section`. */
export function asCard<T extends object>(component: T): T {
    return Object.assign(component, {[CARD]: true});
}

function isCard(element: ReactElement): boolean {
    const props = element.props as { readonly wide?: boolean };

    if (props.wide === true) {
        return false;
    }

    return element.type === Section || (typeof element.type === 'function' && CARD in element.type);
}

function flatten(children: ReactNode): ReactNode[] {
    return Children.toArray(children).flatMap(child =>
        isValidElement<{ readonly children?: ReactNode }>(child) && child.type === Fragment ? flatten(child.props.children) : [child]
    );
}

/*
 * Runs of cards flow through two CSS columns from 840 pixels, each closing up under the one before it. Everything else spans
 * the width between those runs. Spacing between runs comes from the flex gap rather than card margins, because a margin
 * that meets a column break is dropped; inside a run each card carries a bottom margin, and the last one drops it.
 */
function Masonry({children}: { readonly children: ReactNode }) {
    const segments: Segment[] = [];

    for (const child of flatten(children)) {
        const last = segments.at(-1);

        if (isValidElement(child) && isCard(child)) {
            if (last?.cards) {
                last.cards.push(child);
            } else {
                segments.push({key: `cards-${segments.length}`, cards: [child], span: null});
            }

            continue;
        }

        segments.push({key: `span-${segments.length}`, cards: null, span: child});
    }

    return (
        <div className="flex flex-col gap-4 @[520px]:gap-5">
            {segments.map(segment =>
                segment.cards ? (
                    <div key={segment.key} className="gap-x-4 @[520px]:gap-x-5 @[840px]:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid @[520px]:[&>*]:mb-5 [&>*:last-child]:mb-0">
                        {segment.cards}
                    </div>
                ) : (
                    <Fragment key={segment.key}>{segment.span}</Fragment>
                )
            )}
        </div>
    );
}

type PanelBodyProps = {
    readonly children: ReactNode;
    readonly className?: string;
};

/** The scrolling page of a panel; its cards form a masonry, and a {@link PanelGroup} starts a masonry of its own. */
export function PanelBody({children, className}: PanelBodyProps) {
    return (
        <div className="@container h-full overflow-auto">
            <div className={clsx('p-3 @[520px]:p-6', className)}>
                <Masonry>{children}</Masonry>
            </div>
        </div>
    );
}

type PanelGroupProps = {
    readonly title?: string;
    readonly icon?: LucideIcon;
    readonly children: ReactNode;
};

/** A block of cards on one subject. It starts below the previous group, so cards of two groups never share a column. */
export function PanelGroup({title, icon, children}: PanelGroupProps) {
    return (
        <div className="panel-group flex flex-col gap-3 [.panel-group+&]:mt-5">
            {title && (
                <h2 className="flex items-center gap-2 text-sm font-medium text-text">
                    {icon && <Icon icon={icon} size={16} className="shrink-0 text-text-muted"/>}
                    {title}
                </h2>
            )}
            <Masonry>{children}</Masonry>
        </div>
    );
}
