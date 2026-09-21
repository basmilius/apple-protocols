type Modality = 'keyboard' | 'pointer';

let current: Modality | null = null;

const set = (modality: Modality): void => {
    if (current === modality) {
        return;
    }

    current = modality;
    document.documentElement.dataset.modality = modality;
};

/* Which device the app was last driven with, on the root element as `data-modality`. A ring that
   only belongs to keyboard navigation cannot ask `:focus-visible` alone. Focus that a script moves
   (Base UI does that for the hovered menu item) keeps matching it while the browser's own keyboard
   flag is up, which a single keystroke anywhere leaves on. */
export function startInputModality(): void {
    set('pointer');

    window.addEventListener(
        'keydown',
        event => {
            // A modifier on its own is half of a shift-click as often as it is a keystroke.
            if (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Meta') {
                set('keyboard');
            }
        },
        {capture: true}
    );

    window.addEventListener('pointerdown', () => set('pointer'), {capture: true, passive: true});
    window.addEventListener('pointermove', () => set('pointer'), {capture: true, passive: true});
}
