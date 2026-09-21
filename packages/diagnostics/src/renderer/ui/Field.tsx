import type { InputHTMLAttributes } from 'react';
import clsx from 'clsx';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
    /* The accessible name; the row above it usually carries the visible one. */
    readonly label: string;
    readonly mono?: boolean;
};

/* Every single-line text input in the app. */
export function Field({label, mono = false, className, ...rest}: FieldProps) {
    return <input aria-label={label} className={clsx('field', mono && 'mono', className)} {...rest} />;
}
