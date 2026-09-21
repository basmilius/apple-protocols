import type { CallRequest, CallResult } from '@shared/contract';
import { serialize, serializeError } from './serialize';

/** Prototype pollution: a path may never leave the object it started on. */
const FORBIDDEN = ['__proto__', 'constructor', 'prototype'];

export type CallRoots = Partial<Record<CallRequest['root'], unknown>>;

/** Reads or invokes a dotted path under an allowlisted root. Refusals and errors return `ok: false`. */
export async function runCall(roots: CallRoots, request: CallRequest): Promise<CallResult> {
    const started = Date.now();

    try {
        const root = roots[request.root];

        if (root === undefined || root === null) {
            throw new Error(`Root '${request.root}' is not available for this device.`);
        }

        const segments = request.path.split('.').filter(segment => segment.length > 0);

        if (segments.length === 0) {
            throw new Error('A call needs a path.');
        }

        for (const segment of segments) {
            if (FORBIDDEN.includes(segment)) {
                throw new Error(`Path segment '${segment}' is not allowed.`);
            }
        }

        let owner: unknown = root;
        let target: unknown = root;

        for (const segment of segments) {
            if (target === null || target === undefined) {
                throw new Error(`Path '${request.path}' stops at '${segment}': nothing to read it from.`);
            }

            owner = target;
            target = (target as Record<string, unknown>)[segment];
        }

        if (typeof target !== 'function') {
            if (request.args !== undefined) {
                throw new Error(`Path '${request.path}' is not a function, so it takes no arguments.`);
            }

            return {ok: true, kind: 'value', value: serialize(target), durationMs: Date.now() - started};
        }

        const value = await (target as (...args: unknown[]) => unknown).apply(owner, [...(request.args ?? [])]);

        return {ok: true, kind: 'call', value: serialize(value), durationMs: Date.now() - started};
    } catch (error) {
        return {ok: false, error: serializeError(error)};
    }
}
