import { useLayout } from '@/state/layout';
import type { SplitDirection } from './split';

const ARROWS: Record<string, SplitDirection> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
};

/* An input has first claim on a keystroke; the grid's shortcuts all carry a modifier, so only the
   ones that would type a character have to step aside. */
const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/**
 * The shortcuts of the shell, bound once on the window. Panels bring their own; nothing here
 * listens per cell, which is what keeps a grid of nine from registering nine handlers.
 */
export function startShortcuts(): void {
    window.addEventListener('keydown', event => {
        const layout = useLayout.getState();
        const mod = event.metaKey || event.ctrlKey;

        if (!mod) {
            return;
        }

        if (event.key === 'b' && !event.altKey && !event.shiftKey) {
            event.preventDefault();
            layout.toggleSidebar();
            return;
        }

        if (event.key === '\\') {
            event.preventDefault();
            layout.split(event.shiftKey ? 'down' : 'right');
            return;
        }

        if (event.key === 'w' && !event.altKey && !isTyping(event.target)) {
            event.preventDefault();
            layout.close(layout.layout.focus);
            return;
        }

        if (event.altKey && ARROWS[event.key] !== undefined) {
            event.preventDefault();
            layout.focusStep(ARROWS[event.key]);
        }
    });
}
