import { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@adecore/ui';
import { Play } from 'lucide-react';
import { type CallResult, isCallFailure, type RoundTripResult, type ToolInfo, type ToolInput } from '@shared/contract';
import { invoke, messageOf } from '@/client';
import { Banner, Button, CopyButton, Field, Icon, ICONS, JsonView, Pill, Select, type SelectItem, StatusPill, TextArea, TextInput, Toggle } from '@/ui';

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
    const label = input.optional === true ? `${input.label} (optional)` : input.label;

    return (
        <Field label={input.type === 'boolean' ? undefined : label} hint={input.hint}>
            {input.type === 'textarea' && <TextArea label={input.label} rows={input.rows ?? 4} placeholder={input.placeholder} value={String(value)} onChange={event => onChange(event.target.value)}/>}
            {input.type === 'boolean' && <Toggle label={input.label} checked={value === true} onCheckedChange={onChange}/>}
            {input.type === 'select' && <Select label={input.label} value={String(value)} items={options} onValueChange={onChange}/>}
            {(input.type === 'text' || input.type === 'number') && (
                <TextInput
                    label={input.label}
                    mono={input.type === 'text'}
                    type={input.type === 'number' ? 'number' : 'text'}
                    placeholder={input.placeholder}
                    value={String(value)}
                    onChange={event => onChange(event.target.value)}
                />
            )}
        </Field>
    );
}

function RoundTripSummary({value}: { readonly value: RoundTripResult }) {
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={value.ok ? 'ok' : 'warning'}>{value.ok ? 'byte for byte equal' : `differs at byte ${value.offset}`}</StatusPill>
            <Pill tone="muted" mono>{`in ${value.inputLength} B`}</Pill>
            <Pill tone="muted" mono>{`out ${value.outputLength} B`}</Pill>
            {!value.ok && value.expected !== null && <Pill tone="muted" mono>{`expected ${value.expected}, got ${value.actual ?? 'nothing'}`}</Pill>}
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
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <p className="text-xs text-text-muted">{tool.description}</p>
                <span className="mono text-text-faint">{tool.id}</span>
            </div>
            {tool.inputs.map(input => (
                <InputRow key={input.name} input={input} value={values[input.name] ?? ''} onChange={next => setValues(current => ({...current, [input.name]: next}))}/>
            ))}
            <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" disabled={running} onClick={() => void run()}>
                    <Icon icon={Play} size={14}/>
                    {running ? 'Running' : 'Run'}
                </Button>
                {result !== null && !isCallFailure(result) && <Pill tone="muted" mono>{`${result.durationMs} ms`}</Pill>}
                <span className="ml-auto">{value !== null && <CopyButton text={text} label="Copy result"/>}</span>
            </div>
            {result !== null && isCallFailure(result) && <Banner placement="inline" tone="error" icon={ICONS.warning} message={`${result.error.name}: ${result.error.message}`}/>}
            {value !== null && (
                <div className="flex flex-col gap-2">
                    {isRoundTrip(value) && <RoundTripSummary value={value}/>}
                    <ScrollArea axis="both" className="rounded-lg bg-code-bg" viewportClassName="p-2">
                        <JsonView value={value} defaultDepth={3}/>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}
