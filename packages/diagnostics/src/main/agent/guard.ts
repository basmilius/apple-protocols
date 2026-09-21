import type { InvokeChannel } from '@shared/contract';

/** Channels that open a native dialog or only make sense for the window. */
const DENIED: readonly InvokeChannel[] = ['app:theme', 'audio:pickFile'];

/** Channels that throw credentials away. Pairing again needs a person in front of the device. */
const DESTRUCTIVE: readonly InvokeChannel[] = ['pair:forget', 'storage:removeCredentials', 'storage:removeDevice'];

const VOLUME_PATH = /(^|\.)volume\.(set|fade|setForDevice)$/;

/** As a fraction of full scale. An agent has no ears, and the device is in someone's living room. */
const MAX_VOLUME = Number(process.env.DIAGNOSTICS_AGENT_MAX_VOLUME ?? 0.5);

export function isDenied(channel: InvokeChannel): boolean {
    return DENIED.includes(channel);
}

/**
 * Security boundary of the agent bridge: returns why a request is refused, or `null` when it may
 * run. `confirm` lifts the refusals that exist to prevent an accident, never the denied channels.
 */
export function refusal(channel: InvokeChannel, request: unknown, confirm: boolean): string | null {
    if (isDenied(channel)) {
        return `Channel '${channel}' is not available to the agent bridge.`;
    }

    const body = (request ?? {}) as Record<string, unknown>;

    if (channel === 'storage:read' && body.reveal === true) {
        return 'Revealing stored credentials is not available to the agent bridge.';
    }

    if (confirm) {
        return null;
    }

    if (DESTRUCTIVE.includes(channel)) {
        return `Channel '${channel}' removes credentials. Ask the user first, then repeat with confirm.`;
    }

    const volume = requestedVolume(channel, body);

    if (volume !== null && volume > MAX_VOLUME) {
        return `Volume ${volume} is above the agent limit of ${MAX_VOLUME}. Ask the user first, then repeat with confirm.`;
    }

    return null;
}

/** The volume a request asks for as a fraction, or `null` when it sets none. */
function requestedVolume(channel: InvokeChannel, body: Record<string, unknown>): number | null {
    if (channel === 'raop:setVolume' || channel === 'raop:stream') {
        return typeof body.volume === 'number' ? body.volume / 100 : null;
    }

    if (channel !== 'device:call' || typeof body.path !== 'string' || !VOLUME_PATH.test(body.path)) {
        return null;
    }

    const value = (Array.isArray(body.args) ? body.args : []).find(argument => typeof argument === 'number');

    if (value === undefined) {
        return null;
    }

    return value > 1 ? value / 100 : value;
}
