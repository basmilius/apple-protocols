import { Discovery, type DiscoveryResult } from '@basmilius/apple-common';
import { RaopClient } from '@basmilius/apple-raop';
import type { RaopServiceInfo, RaopStatus } from '@shared/contract';
import { handle } from '../../ipc';
import { serialize } from '../../serialize';
import type { ChannelContext } from '../context';
import { buildSource, type BuiltSource } from './sources';

/** One RAOP session, which lives beside the AirPlay session rather than inside it. */
type RaopState = {
    client: RaopClient | null;
    service: DiscoveryResult | null;
    streaming: boolean;
    source: string | null;
    built: BuiltSource | null;
    lastEvent: string | null;
    error: string | null;
};

/** RAOP requires a separate RTSP connection to an advertised `_raop._tcp` service. */
export function registerRaopChannels(context: ChannelContext): void {
    const states = new Map<string, RaopState>();

    let services: DiscoveryResult[] = [];

    const stateOf = (deviceId: string): RaopState => {
        const existing = states.get(deviceId);

        if (existing) {
            return existing;
        }

        const created: RaopState = {
            client: null,
            service: null,
            streaming: false,
            source: null,
            built: null,
            lastEvent: null,
            error: null
        };

        states.set(deviceId, created);

        return created;
    };

    const statusOf = (deviceId: string): RaopStatus => {
        const state = stateOf(deviceId);

        return {
            deviceId,
            connected: state.client !== null,
            streaming: state.streaming,
            serviceId: state.service?.id ?? null,
            address: state.service?.address ?? null,
            modelName: state.service?.modelName ?? null,
            info: state.client === null ? null : (serialize(state.client.info) as Record<string, unknown>),
            source: state.source,
            lastEvent: state.lastEvent,
            error: state.error,
            updatedAt: Date.now()
        };
    };

    const push = (deviceId: string): void => {
        context.send('raop:status', statusOf(deviceId));
    };

    const clientOf = (deviceId: string): RaopClient => {
        const client = stateOf(deviceId).client;

        if (client === null) {
            throw new Error('No RAOP session for this device. Connect first.');
        }

        return client;
    };

    handle('raop:services', async request => {
        services = await Discovery.raop().find(request?.rescan !== true);

        return services.map(describe);
    });

    handle('raop:connect', async request => {
        const state = stateOf(request.deviceId);

        if (state.client !== null) {
            await state.client.close();
            state.client = null;
        }

        if (services.length === 0) {
            services = await Discovery.raop().find(true);
        }

        const discovered = context.sessions.discoveredDevice(request.deviceId);
        const service = request.serviceId ? services.find(candidate => candidate.id === request.serviceId) : services.find(candidate => candidate.address === discovered?.address);

        if (!service) {
            throw new Error('No RAOP service found for this device. Scan for RAOP services first.');
        }

        const timingServer = await context.sessions.timingServer();
        const client = await RaopClient.create(service, timingServer);

        client.on('playing', info => {
            state.lastEvent = `playing: ${info.metadata?.title ?? 'unknown'}`;
            push(request.deviceId);
        });

        client.on('stopped', () => {
            state.lastEvent = 'stopped';
            push(request.deviceId);
        });

        state.client = client;
        state.service = service;
        state.error = null;
        state.lastEvent = 'connected';

        const status = statusOf(request.deviceId);
        context.send('raop:status', status);

        return status;
    });

    /* Streaming runs until the source is exhausted, so completion arrives as a `raop:status` push. */
    handle('raop:stream', async request => {
        const state = stateOf(request.deviceId);
        const client = clientOf(request.deviceId);

        if (state.streaming) {
            throw new Error('This RAOP session is already streaming. Stop it first.');
        }

        const built = await buildSource(request.source);

        state.built = built;
        state.streaming = true;
        state.source = built.description;
        state.error = null;
        push(request.deviceId);

        const metadata = {
            title: request.metadata?.title ?? 'Apple Protocols Diagnostics',
            artist: request.metadata?.artist ?? '',
            album: request.metadata?.album ?? '',
            duration: request.metadata?.duration ?? 0
        };

        client.stream(built.source, {metadata, volume: request.volume}).then(
            () => {
                state.streaming = false;
                state.built?.dispose();
                state.built = null;
                push(request.deviceId);
            },
            error => {
                state.streaming = false;
                state.built?.dispose();
                state.built = null;
                state.error = error instanceof Error ? error.message : String(error);
                push(request.deviceId);
            }
        );
    });

    handle('raop:setVolume', async request => {
        await clientOf(request.deviceId).setVolume(request.volume);
    });

    handle('raop:stop', request => {
        clientOf(request.deviceId).stop();
        stateOf(request.deviceId).built?.dispose();
    });

    handle('raop:close', async request => {
        const state = stateOf(request.deviceId);

        state.built?.dispose();
        state.built = null;
        state.streaming = false;

        if (state.client !== null) {
            await state.client.close();
            state.client = null;
        }

        state.service = null;
        state.lastEvent = 'closed';
        push(request.deviceId);
    });

    handle('raop:status', request => (states.has(request.deviceId) ? statusOf(request.deviceId) : null));
}

function describe(service: DiscoveryResult): RaopServiceInfo {
    return {
        id: service.id,
        fqdn: service.fqdn,
        address: service.address,
        port: service.service.port,
        modelName: service.modelName
    };
}
