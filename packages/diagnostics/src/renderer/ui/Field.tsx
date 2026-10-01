import { Input, type InputProps } from '@basmilius/desktop-ui';

type FieldProps = InputProps & {
    /* The accessible name; the row above it usually carries the visible one. */
    readonly label: string;
};

export function Field({label, ...rest}: FieldProps) {
    return <Input aria-label={label} {...rest}/>;
}
