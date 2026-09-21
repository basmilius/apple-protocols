import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGENT_STATE_FILE, type AgentInvokeRequest, type AgentKind, type AgentPage, type AgentState, type AgentStatus } from '@shared/agent';
import { INVOKE_CHANNELS, type DeviceEvent, type InvokeChannel, type LogEntry, type TrafficRecord } from '@shared/contract';
import { invoke } from '../ipc';
import type { LogBuffer } from '../logs';
import type { Ring } from '../ring';
import type { SessionManager } from '../session';
import { isDenied, refusal } from './guard';

const STATE_PATH = join(homedir(), '.config', 'apple-protocols', AGENT_STATE_FILE);

const DEFAULT_LIMIT = 200;
const DEFAULT_BYTES = 64;
const WAIT_POLL_MS = 100;
const MAX_WAIT_MS = 120_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type AgentServerOptions = {
    readonly sessions: SessionManager;
    readonly logs: LogBuffer;
    readonly events: Ring<DeviceEvent>;
    readonly traffic: Ring<TrafficRecord>;
    isResuming(): boolean;
};

type Filter = {
    readonly cursorOf: (entry: any) => number;
    readonly since: (after: number) => readonly unknown[];
    /** Query parameter to the field it has to equal. */
    readonly fields: Record<string, string>;
};

/**
 * Lets an agent outside the app drive what the window drives: every invoke channel, plus the log,
 * event and traffic buffers read by cursor. Bound to loopback and gated by a token that only
 * someone who can read the user's config directory gets.
 */
export class AgentServer {
    readonly #options: AgentServerOptions;
    readonly #token = randomBytes(24).toString('hex');
    readonly #startedAt = Date.now();
    readonly #filters: Record<AgentKind, Filter>;

    #server: Server | null = null;

    constructor(options: AgentServerOptions) {
        this.#options = options;

        this.#filters = {
            logs: {
                cursorOf: (entry: LogEntry) => entry.id,
                since: after => options.logs.entries.filter(entry => entry.id > after),
                fields: {deviceId: 'deviceId', group: 'group'}
            },
            events: {
                cursorOf: (entry: DeviceEvent) => entry.sequence,
                since: after => options.events.since(after),
                fields: {deviceId: 'deviceId', source: 'source', name: 'name'}
            },
            traffic: {
                cursorOf: (entry: TrafficRecord) => entry.id,
                since: after => options.traffic.since(after),
                fields: {deviceId: 'deviceId', protocol: 'protocol', direction: 'direction'}
            }
        };
    }

    async start(): Promise<void> {
        const server = createServer((request, response) => void this.#onRequest(request, response));

        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        this.#server = server;

        const address = server.address();
        const state: AgentState = {
            port: typeof address === 'object' && address !== null ? address.port : 0,
            token: this.#token,
            pid: process.pid,
            startedAt: this.#startedAt
        };

        await mkdir(join(homedir(), '.config', 'apple-protocols'), {recursive: true});
        await writeFile(STATE_PATH, JSON.stringify(state, null, 4), {mode: 0o600});
    }

    async stop(): Promise<void> {
        this.#server?.close();
        this.#server = null;

        await rm(STATE_PATH, {force: true});
    }

    async #onRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        try {
            if (!this.#authorized(request)) {
                return send(response, 401, {error: 'Missing or wrong bearer token.'});
            }

            const url = new URL(request.url ?? '/', 'http://127.0.0.1');
            const route = `${request.method} ${url.pathname}`;

            switch (route) {
                case 'GET /status':
                    return send(response, 200, this.#status());

                case 'GET /channels':
                    return send(response, 200, INVOKE_CHANNELS.filter(channel => !isDenied(channel)));

                case 'POST /invoke':
                    return send(response, 200, shrink(await this.#invoke(await readBody(request)), bytesLimit(url.searchParams)));

                case 'GET /logs':
                case 'GET /events':
                case 'GET /traffic':
                    return send(response, 200, this.#page(url.pathname.slice(1) as AgentKind, url.searchParams));

                case 'GET /wait':
                    return send(response, 200, await this.#wait(url.searchParams));

                default:
                    return send(response, 404, {error: `No route '${route}'.`});
            }
        } catch (error) {
            send(response, 400, {error: error instanceof Error ? error.message : String(error)});
        }
    }

    #authorized(request: IncomingMessage): boolean {
        const given = Buffer.from(request.headers.authorization ?? '');
        const expected = Buffer.from(`Bearer ${this.#token}`);

        return given.byteLength === expected.byteLength && timingSafeEqual(given, expected);
    }

    #status(): AgentStatus {
        return {
            pid: process.pid,
            startedAt: this.#startedAt,
            resuming: this.#options.isResuming(),
            cursors: {
                logs: this.#options.logs.entries.at(-1)?.id ?? 0,
                events: this.#options.events.head,
                traffic: this.#options.traffic.head
            },
            devices: this.#options.sessions.list()
        };
    }

    async #invoke(body: AgentInvokeRequest): Promise<unknown> {
        const channel = body.channel as InvokeChannel;

        if (!INVOKE_CHANNELS.includes(channel)) {
            throw new Error(`Unknown channel '${body.channel}'.`);
        }

        const refused = refusal(channel, body.request, body.confirm === true);

        if (refused !== null) {
            throw new Error(refused);
        }

        return {result: (await invoke(channel, body.request as never)) ?? null};
    }

    #page(kind: AgentKind, query: URLSearchParams): AgentPage {
        const filter = this.#filters[kind];

        if (filter === undefined) {
            throw new Error(`Unknown kind '${kind}'. Use logs, events or traffic.`);
        }

        const after = Number(query.get('after') ?? 0);
        const limit = Number(query.get('limit') ?? DEFAULT_LIMIT);
        const grep = query.has('grep') ? new RegExp(query.get('grep'), 'i') : null;

        const matches = filter.since(after).filter(entry => {
            for (const [parameter, field] of Object.entries(filter.fields)) {
                if (query.has(parameter) && String((entry as Record<string, unknown>)[field]) !== query.get(parameter)) {
                    return false;
                }
            }

            return grep === null || grep.test(JSON.stringify(entry));
        });

        const entries = matches.slice(0, limit);
        const last = entries[entries.length - 1];

        return {
            entries: shrink(entries, bytesLimit(query)) as unknown[],
            next: last === undefined ? after : filter.cursorOf(last),
            more: matches.length > entries.length
        };
    }

    async #wait(query: URLSearchParams): Promise<AgentPage> {
        const kind = (query.get('kind') ?? 'events') as AgentKind;
        const deadline = Date.now() + Math.min(Number(query.get('timeoutMs') ?? 10_000), MAX_WAIT_MS);

        for (; ;) {
            const page = this.#page(kind, query);

            if (page.entries.length > 0) {
                return page;
            }

            if (Date.now() >= deadline) {
                return {...page, timedOut: true};
            }

            await new Promise(resolve => setTimeout(resolve, WAIT_POLL_MS));
        }
    }
}

function send(response: ServerResponse, status: number, body: unknown): void {
    // Serialized before the headers go out, so a body that cannot be serialized still ends in a 400.
    const text = JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));

    response.writeHead(status, {'Content-Type': 'application/json'});
    response.end(text);
}

async function readBody(request: IncomingMessage): Promise<AgentInvokeRequest> {
    const chunks: Buffer[] = [];
    let length = 0;

    for await (const chunk of request) {
        length += chunk.byteLength;

        if (length > MAX_BODY_BYTES) {
            throw new Error('Request body is too large.');
        }

        chunks.push(chunk);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Bytes to keep per binary value, or `null` for all of them. */
function bytesLimit(query: URLSearchParams): number | null {
    if (query.get('full') === '1') {
        return null;
    }

    return Number(query.get('bytes') ?? DEFAULT_BYTES);
}

/**
 * Cuts every binary value down to `limit` bytes. One artwork message is hundreds of kilobytes of
 * hex, and what reads this is an agent with a context window.
 */
function shrink(value: unknown, limit: number | null): unknown {
    if (limit === null || value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => shrink(item, limit));
    }

    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record)) {
        const isHex = typeof item === 'string' && (key === '$bytes' || (key === 'bytes' && 'size' in record));

        result[key] = isHex ? cutHex(item as string, limit) : shrink(item, limit);
    }

    return result;
}

function cutHex(hex: string, limit: number): string {
    return hex.length > limit * 2 ? `${hex.slice(0, limit * 2)}...` : hex;
}
