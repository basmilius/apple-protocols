import type { CallRequest, CallResult } from '@shared/contract';
import { serialize, serializeError } from './serialize';

/** Prototype pollution: a path may never leave the object it started on. */
const FORBIDDEN = ['__proto__', 'constructor', 'prototype'];

export type CallRoots = Partial<Record<CallRequest['root'], unknown>>;

/** Reads or invokes a dotted path under an allowlisted root. Refusals and errors return `ok: false`. */
export async function runCall(roots: CallRoots, request: CallRequest): Promise<CallResult> {
    const started = Date.now();

    try {
        if (!request || typeof request.root !== 'string' || typeof request.path !== 'string' || (request.args !== undefined && !Array.isArray(request.args))) throw new Error('Invalid call request.');
        if (!Object.hasOwn(roots, request.root)) throw new Error(`Root '${request.root}' is not allowed.`);
        if (['device', 'airplay'].includes(request.root) && ['volume.set', 'volume.fade', 'volume.setForDevice'].includes(request.path)) {
            const index = request.path === 'volume.setForDevice' ? 1 : 0;
            const value = request.args?.[index];
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('SDK volume must be a fraction from 0 to 1.');
            if (request.path === 'volume.fade' && (typeof request.args?.[1] !== 'number' || !Number.isFinite(request.args[1]) || request.args[1] < 0)) throw new RangeError('Fade duration must be non-negative and finite.');
        }
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
