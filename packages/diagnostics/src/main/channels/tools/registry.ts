import type { ToolInfo } from '@shared/contract';

/** A tool is its descriptor plus the function `tool:run` resolves to. */
export type ToolDefinition = ToolInfo & {
    run(args: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
};

/** The input every decoder shares: a pasted byte string. */
export const bytesInput = (name = 'data', label = 'Bytes (hex or base64)', rows = 4) =>
    ({
        name,
        label,
        type: 'textarea',
        placeholder: 'e1 41 61 41 62 03',
        rows
    }) as const;

export const jsonInput = (name = 'value', label = 'Value (JSON)', rows = 6) =>
    ({
        name,
        label,
        type: 'textarea',
        placeholder: '{"a": 1}',
        rows
    }) as const;

export const keyInput = (name: string, label: string) =>
    ({
        name,
        label,
        type: 'text',
        placeholder: '32 bytes of hex'
    }) as const;
