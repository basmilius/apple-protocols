import { TextArea as DesktopTextArea, type TextAreaProps as DesktopTextAreaProps } from '@adecore/ui';

type TextAreaProps = DesktopTextAreaProps & {
    readonly label: string;
};

export function TextArea({label, mono = true, rows = 5, resize = 'vertical', ...rest}: TextAreaProps) {
    return <DesktopTextArea aria-label={label} mono={mono} rows={rows} resize={resize} {...rest}/>;
}
