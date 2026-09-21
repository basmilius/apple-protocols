import type { TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    readonly label: string;
    readonly mono?: boolean;
};

/* The multiline field: a raw message body, a JSON argument list. It carries the field's border and
   focus ring without its fixed height. */
export function TextArea({label, mono = true, className, rows = 5, ...rest}: TextAreaProps) {
    return (
        <textarea
            aria-label={label}
            rows={rows}
            className={clsx(
                'w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none placeholder:text-text-faint focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-accent',
                mono && 'mono',
                className
            )}
            {...rest}
        />
    );
}
