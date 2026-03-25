import type DeviceManager from './deviceManager';

export function handleApiRequest(req: Request, manager: DeviceManager): Response | null {
    const url = new URL(req.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
        return null;
    }

    if (req.method === 'GET' && path === '/api/devices') {
        return handleDiscover(manager);
    }

    if (req.method === 'GET' && path === '/api/state') {
        return handleGetState(manager);
    }

    const connectMatch = path.match(/^\/api\/devices\/(.+)\/connect$/);
    if (req.method === 'POST' && connectMatch) {
        return handleConnect(manager, decodeURIComponent(connectMatch[1]));
    }

    if (req.method === 'POST' && path === '/api/devices/connect-ip') {
        return handleConnectByIp(req, manager);
    }

    if (req.method === 'POST' && path === '/api/devices/disconnect') {
        return handleDisconnect(manager);
    }

    const pairMatch = path.match(/^\/api\/pair\/(.+)\/(.+)$/);
    if (req.method === 'POST' && pairMatch) {
        return handlePairStart(manager, decodeURIComponent(pairMatch[1]), pairMatch[2] as 'airplay' | 'companionLink');
    }

    if (req.method === 'POST' && path === '/api/pair/pin') {
        return handlePairPin(req, manager);
    }

    if (req.method === 'POST' && path === '/api/pair/cancel') {
        return handlePairCancel(manager);
    }

    const commandWithArgMatch = path.match(/^\/api\/command\/([^/]+)\/(.+)$/);
    if (req.method === 'POST' && commandWithArgMatch) {
        return handleCommand(manager, commandWithArgMatch[1], commandWithArgMatch[2]);
    }

    const commandMatch = path.match(/^\/api\/command\/([^/]+)$/);
    if (req.method === 'POST' && commandMatch) {
        return handleCommand(manager, commandMatch[1]);
    }

    return json({error: 'Not found'}, 404);
}

function handleDiscover(manager: DeviceManager): Response {
    return asyncJson(async () => {
        const devices = await manager.discover();
        return {devices};
    });
}

function handleGetState(manager: DeviceManager): Response {
    return json(manager.getState());
}

function handleConnect(manager: DeviceManager, deviceId: string): Response {
    return asyncJson(async () => {
        await manager.connect(deviceId);
        return {ok: true, device: manager.getState().device};
    });
}

function handleConnectByIp(req: Request, manager: DeviceManager): Response {
    return asyncJson(async () => {
        const body = await req.json() as {address?: string; port?: number};

        if (!body.address) {
            throw new Error('Address is required');
        }

        await manager.connectByIp(body.address, body.port);
        return {ok: true, device: manager.getState().device};
    });
}

function handleDisconnect(manager: DeviceManager): Response {
    return asyncJson(async () => {
        await manager.disconnect();
        return {ok: true};
    });
}

function handleCommand(manager: DeviceManager, cmd: string, arg?: string): Response {
    return asyncJson(async () => {
        const result = await manager.executeCommand(cmd, arg);
        return result;
    });
}

function handlePairStart(manager: DeviceManager, deviceId: string, protocol: 'airplay' | 'companionLink'): Response {
    return asyncJson(async () => {
        await manager.startPairing(deviceId, protocol);
        return {ok: true};
    });
}

function handlePairPin(req: Request, manager: DeviceManager): Response {
    return asyncJson(async () => {
        const body = await req.json() as {pin?: string};

        if (!body.pin) {
            throw new Error('PIN is required');
        }

        manager.submitPairingPin(body.pin);
        return {ok: true};
    });
}

function handlePairCancel(manager: DeviceManager): Response {
    return asyncJson(async () => {
        manager.cancelPairing();
        return {ok: true};
    });
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'}
    });
}

function asyncJson(fn: () => Promise<unknown>): Response {
    const body = new ReadableStream({
        async start(controller) {
            try {
                const result = await fn();
                controller.enqueue(new TextEncoder().encode(JSON.stringify(result)));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                controller.enqueue(new TextEncoder().encode(JSON.stringify({error: message})));
            }

            controller.close();
        }
    });

    return new Response(body, {
        headers: {'Content-Type': 'application/json'}
    });
}
