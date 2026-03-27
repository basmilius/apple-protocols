import { Proto } from '@basmilius/apple-airplay';
import type Client from './airplay/client';
import type State from './airplay/state';

/**
 * Gets the CommandInfo for a specific command from the active now-playing client.
 *
 * @param state - The AirPlay state tracker.
 * @param command - The command to look up.
 * @returns The command info, or null if no client is active or command not found.
 */
export function getCommandInfo(state: State, command: Proto.Command): Proto.CommandInfo | null {
    const client: Client | null = state.nowPlayingClient;

    if (!client) {
        return null;
    }

    return client.supportedCommands.find(c => c.command === command) ?? null;
}

/**
 * Checks whether a command is supported and enabled by the active now-playing client.
 *
 * @param state - The AirPlay state tracker.
 * @param command - The command to check.
 * @returns True if supported and enabled, false otherwise.
 */
export function isCommandSupported(state: State, command: Proto.Command): boolean {
    const client: Client | null = state.nowPlayingClient;

    if (!client) {
        return false;
    }

    return client.isCommandSupported(command);
}
