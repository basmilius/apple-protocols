import { useRef } from 'react';
import clsx from 'clsx';
import { CONSOLE_SIZE, useLayout } from '@/state/layout';
import { ErrorBoundary } from '@/ui';
import { LogConsole } from './LogConsole';
import { useColumnResize } from './useColumnResize';

/* Keep the inner console at its stored size while collapsing the outer shell to avoid reflow during closing. */
export function ConsoleDock() {
    const open = useLayout(state => state.consoleOpen);
    const dock = useLayout(state => state.consoleDock);
    const sizes = useLayout(state => state.consoleSize);
    const setConsoleSize = useLayout(state => state.setConsoleSize);
    const ref = useRef<HTMLElement>(null);
    const bottom = dock === 'bottom';
    const size = sizes[dock];
    const {startResize} = useColumnResize(ref, {
        size,
        min: CONSOLE_SIZE[dock].min,
        max: CONSOLE_SIZE[dock].max,
        from: bottom ? 'bottom' : 'right',
        onSize: next => setConsoleSize(dock, next)
    });

    return (
        <aside
            ref={ref}
            inert={!open}
            className={clsx('panel-shell flex shrink-0 overflow-hidden', bottom ? 'w-full justify-end' : 'h-full justify-end')}
            style={bottom ? {height: open ? size : 0} : {width: open ? size : 0}}
        >
            <div
                className={clsx('relative shrink-0', bottom ? 'w-full border-t border-border' : 'h-full border-l border-border')}
                style={bottom ? {height: size} : {width: size}}
            >
                {open && (
                    <div
                        role="separator"
                        aria-orientation={bottom ? 'horizontal' : 'vertical'}
                        className={clsx('absolute z-10', bottom ? 'inset-x-0 top-0 h-2 cursor-row-resize' : 'inset-y-0 left-0 w-2 cursor-col-resize')}
                        onPointerDown={startResize}
                    />
                )}
                <ErrorBoundary label="The log console failed to render">
                    <LogConsole/>
                </ErrorBoundary>
            </div>
        </aside>
    );
}
