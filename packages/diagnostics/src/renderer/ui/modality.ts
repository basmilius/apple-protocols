type Modality = 'keyboard' | 'pointer';

let current: Modality | null = null;

const set = (modality: Modality): void => {
    if (current === modality) {
        return;
    }

    current = modality;
    document.documentElement.dataset.modality = modality;
};

/* Track input modality because Base UI hover moves focus and can retain `:focus-visible` after keyboard input. */
export function startInputModality(): void {
    set('pointer');

    window.addEventListener(
        'keydown',
        event => {
            /* Ignore modifiers alone so Shift-click still counts as pointer input. */
            if (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Meta') {
                set('keyboard');
            }
        },
        {capture: true}
    );

    window.addEventListener('pointerdown', () => set('pointer'), {capture: true, passive: true});
    window.addEventListener('pointermove', () => set('pointer'), {capture: true, passive: true});
}
