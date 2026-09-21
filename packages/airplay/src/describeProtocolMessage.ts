import { type DescExtension, getExtension, hasExtension } from '@bufbuild/protobuf';
import * as Proto from './proto';

// Extension field numbers identify payload schemas independently of event handlers and message type aliases.
const extensions: Map<number, DescExtension> = new Map();

for (const value of Object.values(Proto)) {
    if (typeof value === 'object' && value !== null && 'kind' in value
        && value.kind === 'extension' && value.extendee.typeName === Proto.ProtocolMessageSchema.typeName) {
        extensions.set(value.number, value);
    }
}

export function describeProtocolMessage(message: Proto.ProtocolMessage): Record<string, unknown> {
    const {$unknown, ...envelope} = message;
    const decoded: Record<string, unknown> = {};
    const consumed = new Set<number>();
    const errors: Record<string, string> = {};

    for (const number of new Set(($unknown ?? []).map(field => field.no))) {
        const extension = extensions.get(number);

        if (!extension || !hasExtension(message, extension)) {
            continue;
        }

        try {
            decoded[extension.name] = getExtension(message, extension);
            consumed.add(number);
        } catch (error) {
            errors[extension.name] = error instanceof Error ? error.message : String(error);
        }
    }

    const payloads = Object.values(decoded);
    const remaining = ($unknown ?? []).filter(field => !consumed.has(field.no));

    return {
        ...envelope,
        typeName: Proto.ProtocolMessage_Type[message.type] ?? `type=${message.type}`,
        ...(payloads.length > 0 ? {payload: payloads.length === 1 ? payloads[0] : decoded} : {}),
        ...(remaining.length > 0 ? {$unknown: remaining} : {}),
        ...(Object.keys(errors).length > 0 ? {decodeErrors: errors} : {})
    };
}
