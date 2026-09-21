/* The parent row supplies spacing; this separator adds no margin. */
export function Separator({orientation = 'vertical'}: { readonly orientation?: 'vertical' | 'horizontal' }) {
    return <span aria-hidden className={orientation === 'vertical' ? 'h-4 w-px shrink-0 bg-border' : 'h-px w-full shrink-0 bg-border'}/>;
}
