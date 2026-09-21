import type { RawBuilderInfo, RawParam } from '@shared/contract';
import { Field, Select, TextArea, Toggle } from '@/ui';

type RawFormProps = {
    readonly builder: RawBuilderInfo;
    readonly args: Readonly<Record<string, unknown>>;
    readonly onArgsChange: (args: Record<string, unknown>) => void;
    readonly disabled?: boolean;
};

export function defaultArgs(builder: RawBuilderInfo): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    for (const param of builder.params) {
        args[param.name] = param.defaultValue ?? emptyFor(param);
    }

    return args;
}

export function RawForm({builder, args, onArgsChange, disabled}: RawFormProps) {
    if (builder.params.length === 0) {
        return <p className="text-xs text-text-muted">This message takes no arguments.</p>;
    }

    const set = (name: string, value: unknown): void => {
        onArgsChange({...args, [name]: value});
    };

    return (
        <div className="flex flex-col gap-2">
            {builder.params.map(param => (
                <div key={param.name} className="flex flex-col gap-1">
                    <Control param={param} value={args[param.name]} disabled={disabled} onValueChange={value => set(param.name, value)}/>
                    {param.hint && <p className="text-xs text-text-muted">{param.hint}</p>}
                </div>
            ))}
        </div>
    );
}

function Control({param, value, disabled, onValueChange}: { readonly param: RawParam; readonly value: unknown; readonly disabled?: boolean; readonly onValueChange: (value: unknown) => void }) {
    switch (param.type) {
        case 'boolean':
            return <Toggle label={param.label} checked={value === true} disabled={disabled} onCheckedChange={onValueChange}/>;

        case 'number':
            return <Field label={param.label} type="number" value={Number(value ?? 0)} disabled={disabled} onChange={event => onValueChange(Number(event.target.value))} mono/>;

        case 'enum':
            return (
                <Select<string>
                    label={param.label}
                    value={String(value ?? '')}
                    disabled={disabled}
                    onValueChange={next => onValueChange(Number(next))}
                    items={(param.options ?? []).map(option => ({value: String(option.value), label: `${option.label} (${option.value})`}))}
                />
            );

        case 'json':
            return <TextArea label={param.label} value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 4)} disabled={disabled} rows={5} onChange={event => onValueChange(event.target.value)}/>;

        case 'stringList':
            return <Field label={`${param.label} (comma separated)`} value={Array.isArray(value) ? (value as string[]).join(', ') : ''} disabled={disabled} onChange={event => onValueChange(splitList(event.target.value))} mono/>;

        default:
            return <Field label={param.label} value={String(value ?? '')} disabled={disabled} onChange={event => onValueChange(event.target.value)} mono/>;
    }
}

function splitList(value: string): string[] {
    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);
}

function emptyFor(param: RawParam): unknown {
    switch (param.type) {
        case 'boolean':
            return false;

        case 'number':
        case 'enum':
            return 0;

        case 'stringList':
            return [];

        case 'json':
            return '{}';

        default:
            return '';
    }
}
