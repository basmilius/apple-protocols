#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { AGENT_MARK_FILE, AGENT_STATE_FILE, type AgentCursors, type AgentKind, type AgentPage, type AgentState, type AgentStatus } from '../src/shared/agent';
import type { CallResult, DeviceEvent, DiscoveredDeviceInfo, LogEntry, TrafficRecord } from '../src/shared/contract';

const CONFIG = join(homedir(), '.config', 'apple-protocols');

const HELP = `diag: drive the running diagnostics app and read what it captured.

  status                                  bridge, cursors and devices
  wait-ready [--timeout 60]               wait for the app (after a restart) and its reconnects
  channels                                every invoke channel
  devices [--scan]                        discovered devices
  connect <device> | disconnect <device>
  snapshot <device>                       current state snapshot
  call <device> <root> <path> [args...]   call or read a path; args are JSON, or plain strings
  invoke <channel> [json] [--confirm]     any channel, raw
  mark                                    remember the current cursors
  logs | events | traffic [filters]       read a buffer
  wait <logs|events|traffic> [filters]    block until something matches, --timeout in seconds

<device> is a device id or a part of its name.
Roots: device, airplay, airplayState, companionLink, airplayProtocol, companionLinkProtocol.

Filters: --device <device>  --after <cursor> | --since-mark  --grep <regex>  --limit <n>
         --group (logs)  --source --name (events)  --protocol --direction (traffic)
Output:  --decoded (traffic: print the decoded message)  --json  --bytes <n>  --full`;

const {values: flags, positionals} = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        after: {type: 'string'},
        bytes: {type: 'string'},
        confirm: {type: 'boolean'},
        decoded: {type: 'boolean'},
        device: {type: 'string'},
        direction: {type: 'string'},
        full: {type: 'boolean'},
        grep: {type: 'string'},
        group: {type: 'string'},
        help: {type: 'boolean'},
        json: {type: 'boolean'},
        limit: {type: 'string'},
        name: {type: 'string'},
        protocol: {type: 'string'},
        scan: {type: 'boolean'},
        'since-mark': {type: 'boolean'},
        source: {type: 'string'},
        timeout: {type: 'string'}
    }
});

type Mark = AgentCursors & { readonly startedAt: number };

async function readState(): Promise<AgentState> {
    try {
        return JSON.parse(await readFile(join(CONFIG, AGENT_STATE_FILE), 'utf8'));
    } catch {
        throw new Error('The diagnostics app is not running with its agent bridge. Ask the user to start it: bun --cwd packages/diagnostics dev:agent');
    }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const state = await readState();

    const response = await fetch(`http://127.0.0.1:${state.port}${path}`, {
        method,
        headers: {Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const payload = await response.json() as T & { error?: string };

    if (!response.ok) {
        throw new Error(payload.error ?? `Bridge answered ${response.status}.`);
    }

    return payload;
}

function outputQuery(): URLSearchParams {
    const query = new URLSearchParams();

    if (flags.full) {
        query.set('full', '1');
    }

    if (flags.bytes) {
        query.set('bytes', flags.bytes);
    }

    return query;
}

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
    const {result} = await request<{ result: T }>('POST', `/invoke?${outputQuery()}`, {channel, request: payload, confirm: flags.confirm === true});

    return result;
}

async function resolveDevice(reference: string): Promise<DiscoveredDeviceInfo> {
    let devices = await invoke<readonly DiscoveredDeviceInfo[]>('discovery:list');

    if (devices.length === 0) {
        devices = await invoke<readonly DiscoveredDeviceInfo[]>('discovery:scan', {});
    }

    const needle = reference.toLowerCase();
    const exact = devices.filter(device => device.id === reference);
    const matches = exact.length > 0 ? exact : devices.filter(device => device.name.toLowerCase().includes(needle));

    if (matches.length === 1) {
        return matches[0];
    }

    const names = (matches.length === 0 ? devices : matches).map(device => `${device.name} (${device.id})`).join(', ');

    throw new Error(matches.length === 0 ? `No device matches '${reference}'. Known: ${names || 'none, try devices --scan'}` : `'${reference}' matches more than one device: ${names}`);
}

async function bufferQuery(): Promise<URLSearchParams> {
    const query = outputQuery();

    for (const name of ['grep', 'limit', 'group', 'source', 'name', 'protocol', 'direction'] as const) {
        if (flags[name] !== undefined) {
            query.set(name, flags[name]);
        }
    }

    if (flags.device) {
        query.set('deviceId', (await resolveDevice(flags.device)).id);
    }

    return query;
}

/** A mark from before a main-process restart refers to discarded buffers. Read from the start in that case. */
async function cursorFor(kind: AgentKind): Promise<number> {
    if (flags.after !== undefined) {
        return Number(flags.after);
    }

    if (!flags['since-mark']) {
        return 0;
    }

    const mark: Mark = JSON.parse(await readFile(join(CONFIG, AGENT_MARK_FILE), 'utf8'));
    const state = await readState();

    return mark.startedAt === state.startedAt ? mark[kind] : 0;
}

function time(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(11, 23);
}

function print(value: unknown): void {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

function printPage(kind: AgentKind, page: AgentPage): void {
    if (flags.json) {
        return print(page);
    }

    for (const entry of page.entries) {
        if (kind === 'logs') {
            const log = entry as LogEntry;
            print(`#${log.id} ${time(log.timestamp)} ${log.group} ${log.deviceId ?? '-'} ${log.message}`);
        } else if (kind === 'events') {
            const event = entry as DeviceEvent;
            print(`#${event.sequence} ${time(event.timestamp)} ${event.deviceId} ${event.source}.${event.name}${flags.decoded ? ` ${JSON.stringify(event.payload)}` : ''}`);
        } else {
            const record = entry as TrafficRecord;
            print(`#${record.id} ${time(record.timestamp)} ${record.deviceId ?? '-'} ${record.direction === 'out' ? '->' : '<-'} ${record.protocol} ${record.summary}${record.size === null ? '' : ` (${record.size}B)`}`);

            if (flags.decoded) {
                print(record.decoded);
            }
        }
    }

    print(`-- ${page.entries.length} ${kind}, next cursor ${page.next}${page.more ? ', more available (raise --limit or continue with --after)' : ''}${page.timedOut ? ', timed out' : ''}`);
}

function parseArgument(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function waitReady(): Promise<AgentStatus> {
    const deadline = Date.now() + Number(flags.timeout ?? 60) * 1000;
    let failure: unknown = null;

    while (Date.now() < deadline) {
        try {
            const status = await request<AgentStatus>('GET', '/status');

            if (!status.resuming) {
                return status;
            }
        } catch (error) {
            failure = error;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw failure ?? new Error('The app is still reconnecting its devices.');
}

function printDevices(devices: readonly DiscoveredDeviceInfo[]): void {
    if (flags.json) {
        return print(devices);
    }

    for (const device of devices) {
        print(`${device.session.padEnd(12)} ${device.name}  ${device.id}  ${device.address ?? ''}`);
    }
}

async function main(): Promise<void> {
    const [command, ...rest] = positionals;

    if (flags.help) {
        return print(HELP);
    }

    switch (command) {
        case 'status': {
            const status = await request<AgentStatus>('GET', '/status');

            return flags.json ? print(status) : print(`pid ${status.pid}, resuming ${status.resuming}, cursors ${JSON.stringify(status.cursors)}, ${status.devices.filter(device => device.session === 'connected').length}/${status.devices.length} devices connected`);
        }

        case 'wait-ready':
            return printDevices((await waitReady()).devices);

        case 'channels':
            return print((await request<readonly string[]>('GET', '/channels')).join('\n'));

        case 'devices':
            return printDevices(await invoke(flags.scan ? 'discovery:scan' : 'discovery:list', flags.scan ? {rescan: true} : undefined));

        case 'connect': {
            const device = await resolveDevice(rest[0]);
            await invoke('device:connect', {deviceId: device.id});

            return print(`connected ${device.name}`);
        }

        case 'disconnect': {
            const device = await resolveDevice(rest[0]);
            await invoke('device:disconnect', {deviceId: device.id});

            return print(`disconnected ${device.name}`);
        }

        case 'snapshot':
            return print(await invoke('device:snapshot', {deviceId: (await resolveDevice(rest[0])).id}));

        case 'call': {
            const [reference, root, path, ...args] = rest;
            const device = await resolveDevice(reference);
            const result = await invoke<CallResult>('device:call', {deviceId: device.id, root, path, args: args.length > 0 ? args.map(parseArgument) : undefined});

            print(result);
            process.exitCode = result.ok ? 0 : 1;
            return;
        }

        case 'invoke':
            return print(await invoke(rest[0], rest[1] === undefined ? undefined : JSON.parse(rest[1])));

        case 'mark': {
            const status = await request<AgentStatus>('GET', '/status');
            const mark: Mark = {...status.cursors, startedAt: status.startedAt};

            await writeFile(join(CONFIG, AGENT_MARK_FILE), JSON.stringify(mark));

            return print(`marked ${JSON.stringify(status.cursors)}`);
        }

        case 'logs':
        case 'events':
        case 'traffic': {
            const query = await bufferQuery();
            query.set('after', String(await cursorFor(command)));

            return printPage(command, await request<AgentPage>('GET', `/${command}?${query}`));
        }

        case 'wait': {
            const kind = (rest[0] ?? 'events') as AgentKind;
            const query = await bufferQuery();
            query.set('kind', kind);
            query.set('after', String(await cursorFor(kind)));
            query.set('timeoutMs', String(Number(flags.timeout ?? 10) * 1000));

            const page = await request<AgentPage>('GET', `/wait?${query}`);

            printPage(kind, page);
            process.exitCode = page.timedOut ? 1 : 0;
            return;
        }

        default:
            return print(HELP);
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
