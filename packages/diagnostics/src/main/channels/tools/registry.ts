import type { ToolInfo } from '@shared/contract';

export type ToolDefinition = ToolInfo & {
    run(args: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
};

/** The input every decoder shares: a pasted byte string. */
export function bytesInput(name = 'data', label = 'Bytes (hex or base64)', rows = 4) {
    return {
        name,
        label,
        type: 'textarea',
        placeholder: 'e1 41 61 41 62 03',
        rows
    } as const;
}

export function jsonInput(name = 'value', label = 'Value (JSON)', rows = 6) {
    return {
        name,
        label,
        type: 'textarea',
        placeholder: '{"a": 1}',
        rows
    } as const;
}

export function keyInput(name: string, label: string) {
    return {
        name,
        label,
        type: 'text',
        placeholder: '32 bytes of hex'
    } as const;
}
