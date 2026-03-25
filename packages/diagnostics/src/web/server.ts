import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Server, ServerWebSocket } from 'bun';
import type { Storage } from '@basmilius/apple-common';
import DeviceManager from './deviceManager';
import { handleApiRequest } from './api';
import { addLogListener, getLogBuffer, installLogBridge, removeLogListener, type LogEntry } from './logBridge';
import embeddedAssets from './embeddedAssets';

type WebSocketData = {
    id: string;
};

const DIST_DIR = resolve(import.meta.dir, '../../dist-web');
const useFileSystem = existsSync(DIST_DIR);

export type WebServer = {
    server: Server<WebSocketData>;
    stop(): Promise<void>;
};

export async function startWebServer(storage: Storage, port = 3000): Promise<WebServer> {
    installLogBridge();

    const manager = new DeviceManager(storage);
    const clients = new Set<ServerWebSocket<WebSocketData>>();

    manager.addListener((event, data) => {
        broadcast(clients, {type: event, ...data as object});
    });

    const server = Bun.serve<WebSocketData>({
        port,

        async fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === '/ws') {
                const upgraded = server.upgrade(req, {
                    data: {id: crypto.randomUUID()}
                });

                if (upgraded) {
                    return undefined as unknown as Response;
                }

                return new Response('WebSocket upgrade failed', {status: 400});
            }

            const apiResponse = handleApiRequest(req, manager);

            if (apiResponse) {
                return apiResponse;
            }

            return serveStatic(url.pathname);
        },

        websocket: {
            open(ws) {
                clients.add(ws);

                const buffer = getLogBuffer();

                ws.send(JSON.stringify({
                    type: 'init',
                    logs: buffer,
                    state: manager.getState()
                }));

                const logListener = (entry: LogEntry) => {
                    ws.send(JSON.stringify({type: 'log', entry}));
                };

                addLogListener(logListener);

                (ws as any)._logListener = logListener;
            },

            message() {},

            close(ws) {
                clients.delete(ws);

                const logListener = (ws as any)._logListener;

                if (logListener) {
                    removeLogListener(logListener);
                }
            }
        }
    });

    console.log(`Web diagnostics server running at http://localhost:${port}`);

    return {
        server,
        async stop() {
            await manager.disconnect();
            server.stop();
        }
    };
}

function broadcast(clients: Set<ServerWebSocket<WebSocketData>>, data: object): void {
    const message = JSON.stringify(data);

    for (const client of clients) {
        client.send(message);
    }
}

function serveStatic(pathname: string): Response {
    const filePath = pathname === '/' ? '/index.html' : pathname;

    if (useFileSystem) {
        const fullPath = resolve(DIST_DIR, '.' + filePath);

        if (!fullPath.startsWith(DIST_DIR)) {
            return new Response('Forbidden', {status: 403});
        }

        return new Response(Bun.file(fullPath), {
            headers: {'Content-Type': getMimeType(filePath)}
        });
    }

    const content = embeddedAssets[filePath];

    if (content) {
        return new Response(content, {
            headers: {'Content-Type': getMimeType(filePath)}
        });
    }

    return new Response('Not found', {status: 404});
}

function getMimeType(path: string): string {
    if (path.endsWith('.html')) { return 'text/html'; }
    if (path.endsWith('.js')) { return 'application/javascript'; }
    if (path.endsWith('.css')) { return 'text/css'; }
    if (path.endsWith('.svg')) { return 'image/svg+xml'; }
    if (path.endsWith('.png')) { return 'image/png'; }
    if (path.endsWith('.ico')) { return 'image/x-icon'; }
    if (path.endsWith('.json')) { return 'application/json'; }

    return 'application/octet-stream';
}
