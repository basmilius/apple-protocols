/* A hairline between two groups of controls in a toolbar-like row. It carries no margin of its own.
   The row's gap puts 8px on either side of it, which is what makes the line read as a divider and
   not as a group of its own. */
export function Separator({orientation = 'vertical'}: { readonly orientation?: 'vertical' | 'horizontal' }) {
    return <span aria-hidden className={orientation === 'vertical' ? 'h-4 w-px shrink-0 bg-border' : 'h-px w-full shrink-0 bg-border'}/>;
}
