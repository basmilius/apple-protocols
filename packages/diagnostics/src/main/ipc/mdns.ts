import { AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, mdnsMulticast, mdnsUnicast, RAOP_SERVICE } from '@basmilius/apple-common';
import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';
import type { MdnsResult } from '@shared/snapshots';

const DEFAULT_SERVICES = [AIRPLAY_SERVICE, COMPANION_LINK_SERVICE, RAOP_SERVICE];

function toResults(services: Awaited<ReturnType<typeof mdnsMulticast>>): MdnsResult[] {
    return services.map(service => ({
        name: service.name,
        type: service.type,
        address: service.address,
        port: service.port,
        properties: service.properties
    }));
}

export function registerMdns(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'mdns:multicast', async (_, {services, timeout}) => {
        const result = await mdnsMulticast(services ?? DEFAULT_SERVICES, timeout);
        return toResults(result);
    });

    handle(ipcMain, ctx, 'mdns:unicast', async (_, {address, services, timeout}) => {
        const result = await mdnsUnicast([address], services ?? DEFAULT_SERVICES, timeout);
        return toResults(result);
    });
}
