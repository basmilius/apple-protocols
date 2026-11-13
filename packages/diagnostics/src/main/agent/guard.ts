import type { InvokeChannel, RawMessageRequest } from '@shared/contract';
import { validateRawRequest } from '../channels/media/rawCatalog';
import { checkAction } from './actions';

const DENIED: readonly InvokeChannel[] = ['app:theme', 'audio:pickFile'];
const DESTRUCTIVE: readonly InvokeChannel[] = ['pair:forget', 'storage:removeCredentials', 'storage:removeDevice'];
const configured = Number(process.env.DIAGNOSTICS_AGENT_MAX_VOLUME ?? 0.5);
const MAX_VOLUME = Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.5;

export function isDenied(channel: InvokeChannel): boolean {
    return DENIED.includes(channel);
}

/** Confirmation relaxes policy limits, never input validation or the action registry. */
export function refusal(channel: InvokeChannel, request: unknown, confirm: boolean): string | null {
    if (isDenied(channel)) return `Channel '${channel}' is not available to the agent bridge.`;
    if (request !== undefined && (request === null || typeof request !== 'object' || Array.isArray(request))) return 'Request must be an object.';
    const body = (request ?? {}) as Record<string, unknown>;
    if (channel === 'storage:read' && body.reveal === true) return 'Revealing stored credentials is not available to the agent bridge.';
    if (channel === 'raw:send') {
        try {validateRawRequest(body as unknown as RawMessageRequest);} catch (error) {return error instanceof Error ? error.message : String(error);}
    }
    let volume: number | undefined;
    let needsConfirm = DESTRUCTIVE.includes(channel) || channel === 'raw:send';
    if (channel === 'device:call') {
        const action = checkAction(body);
        if (action.error) return action.error;
        volume = action.volume;
        needsConfirm ||= action.confirm === true;
    }
    if (channel === 'raop:setVolume' || channel === 'raop:stream') {
        const value = body.volume;
        if (channel === 'raop:setVolume' || value !== undefined) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return 'RAOP volume must be a percentage from 0 to 100.';
            volume = value / 100;
        }
    }
    if (channel === 'audio:stream') {
        const value = body.volumeDb ?? -20;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < -144 || value > 0) return 'Audio volumeDb must be between -144 and 0 dB.';
        volume = value === -144 ? 0 : 10 ** (value / 20);
    }
    if (!confirm && needsConfirm) return `Channel '${channel}' needs user agreement, then confirm.`;
    if (!confirm && volume !== undefined && volume > MAX_VOLUME) return `Volume ${volume} is above the agent limit of ${MAX_VOLUME}. Ask the user first, then repeat with confirm.`;
    return null;
}
