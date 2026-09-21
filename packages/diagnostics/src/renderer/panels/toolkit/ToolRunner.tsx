import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { type CallResult, isCallFailure, type RoundTripResult, type ToolInfo, type ToolInput } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { Badge, Button, Field, Icon, JsonView, Select, type SelectItem, TextArea, Toggle } from '@/ui';
import { CopyButton } from './CopyButton';

type Values = Record<string, string | boolean>;

const initialValues = (inputs: readonly ToolInput[]): Values => {
    const values: Values = {};

    for (const input of inputs) {
        values[input.name] = input.type === 'boolean' ? input.default === true : String(input.default ?? '');
    }

    return values;
};

const isRoundTrip = (value: unknown): value is RoundTripResult =>
    typeof value === 'object' && value !== null && typeof (value as RoundTripResult).offset === 'number' && typeof (value as RoundTripResult).input === 'string';

function InputRow({input, value, onChange}: { readonly input: ToolInput; readonly value: string | boolean; readonly onChange: (next: string | boolean) => void }) {
    const options = useMemo<SelectItem<string>[]>(() => (input.options ?? []).map(option => ({value: option.value, label: option.label})), [input.options]);

    return (
        <label className="flex flex-col gap-1">
            <span className="flex items-baseline gap-2 text-xs text-text-muted">
                {input.label}
                {input.optional === true && <span className="text-xs text-text-faint">optional</span>}
            </span>
            {input.type === 'textarea' && <TextArea label={input.label} rows={input.rows ?? 4} placeholder={input.placeholder} value={String(value)} onChange={event => onChange(event.target.value)}/>}
            {input.type === 'boolean' && <Toggle label={input.label} checked={value === true} onCheckedChange={onChange}/>}
            {input.type === 'select' && <Select label={input.label} value={String(value)} items={options} onValueChange={onChange}/>}
            {(input.type === 'text' || input.type === 'number') && (
                <Field
                    label={input.label}
                    mono={input.type === 'text'}
                    type={input.type === 'number' ? 'number' : 'text'}
                    placeholder={input.placeholder}
                    value={String(value)}
                    onChange={event => onChange(event.target.value)}
                />
            )}
            {input.hint && <span className="text-xs text-text-faint">{input.hint}</span>}
        </label>
    );
}

function RoundTripSummary({value}: { readonly value: RoundTripResult }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={value.ok ? 'idle' : 'warning'}>{value.ok ? 'byte for byte equal' : `differs at byte ${value.offset}`}</Badge>
            <Badge tone="muted" mono>
                in {value.inputLength} B
            </Badge>
            <Badge tone="muted" mono>
                out {value.outputLength} B
            </Badge>
            {!value.ok && value.expected !== null && (
                <Badge tone="muted" mono>
                    expected {value.expected}, got {value.actual ?? 'nothing'}
                </Badge>
            )}
        </div>
    );
}

export function ToolRunner({tool, deviceId}: { readonly tool: ToolInfo; readonly deviceId: string | null }) {
    const [values, setValues] = useState<Values>(() => initialValues(tool.inputs));
    const [result, setResult] = useState<CallResult | null>(null);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        setValues(initialValues(tool.inputs));
        setResult(null);
    }, [tool]);

    const run = async (): Promise<void> => {
        setRunning(true);

        try {
            setResult(await invoke('tool:run', {toolId: tool.id, deviceId, args: values}));
        } catch (error) {
            setResult({ok: false, error: {name: 'Error', message: messageOf(error), stack: null}});
        } finally {
            setRunning(false);
        }
    };

    const value = result !== null && !isCallFailure(result) ? result.value : null;
    const text = value === null ? '' : JSON.stringify(value, null, 4);

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">{tool.description}</p>
            {tool.inputs.map(input => (
                <InputRow key={input.name} input={input} value={values[input.name] ?? ''} onChange={next => setValues(current => ({...current, [input.name]: next}))}/>
            ))}
            <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" disabled={running} onClick={() => void run()}>
                    <Icon icon={Play} size={14}/>
                    {running ? 'Running' : 'Run'}
                </Button>
                {result !== null && !isCallFailure(result) && <Badge tone="muted">{result.durationMs} ms</Badge>}
                <span className="ml-auto">{value !== null && <CopyButton text={text} label="Copy result"/>}</span>
            </div>
            {result !== null && isCallFailure(result) && (
                <p className="mono rounded-lg border border-status-error/40 bg-status-error/10 px-2 py-1.5 text-xs text-status-error">
                    {result.error.name}: {result.error.message}
                </p>
            )}
            {value !== null && (
                <div className="flex flex-col gap-2">
                    {isRoundTrip(value) && <RoundTripSummary value={value}/>}
                    <div className="overflow-auto rounded-lg border border-border bg-code-bg p-2">
                        <JsonView value={value} defaultDepth={3}/>
                    </div>
                </div>
            )}
        </div>
    );
}
