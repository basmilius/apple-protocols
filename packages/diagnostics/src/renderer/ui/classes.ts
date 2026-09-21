/*
 * The utility strings more than a couple of call sites share. They live here and not in
 * `styles.css` because each one is only a bundle of utilities. The stylesheet keeps the tokens and
 * the rules utilities cannot write, and a shared string keeps a call site's own utility winning.
 * A label takes the line height of the row it sits in, which is why the sizes carry `/[inherit]`.
 */

/* Icon buttons that belong together sit 1px apart; groups keep the wider gap of their container. */
export const BTN_GROUP = 'inline-flex items-center gap-px';

/* The label above a group of menu rows. */
export const MENU_LABEL = 'px-2.5 pt-1.5 pb-0.5 text-xs/[inherit] text-text-faint';

/* The same label outside a popup: the sidebar's groups, a panel's section headers. */
export const SECTION_LABEL = 'text-xs/[inherit] font-medium text-text-faint';

/* The hairline between two groups of menu rows. It runs the whole width of the popup, which is what
   the negative margin buys back from its 4px of padding, and it is softer than a border a surface
   ends with. It divides rows that are already on one surface. */
export const MENU_SEPARATOR = '-mx-1 my-1 h-px bg-border-soft';

/* A shortcut next to a label: in a tooltip and on a key cap in a panel. */
export const TOOLTIP_KBD = 'rounded-sm bg-surface-sunken px-[5px] py-px font-sans text-xs/[inherit] text-text-muted';

/* A dense value in a diagnostics panel: a hex dump, an identifier, a serialized payload. */
export const MONO = 'mono text-text break-all';

/* The second line of a row: an address, a port, a count. Figures line up under each other, so a
   column of addresses reads as a column. */
export const META = 'text-2xs tabular-nums text-text-faint';

/* The wordmark in the sidebar's title strip. The only place the brand face is used. */
export const BRAND = 'inline-flex h-6 items-center font-brand text-xs font-semibold tracking-[0.2em] text-text-faint';
