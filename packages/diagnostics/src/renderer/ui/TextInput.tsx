import { Input, type InputProps } from '@adecore/ui';

type TextInputProps = InputProps & {
    /* The accessible name; a `Field` around it usually carries the visible one. */
    readonly label: string;
};

export function TextInput({label, ...rest}: TextInputProps) {
    return <Input aria-label={label} {...rest}/>;
}
