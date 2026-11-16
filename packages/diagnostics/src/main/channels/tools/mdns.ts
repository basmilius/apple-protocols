import { Discovery, mdnsMulticast, mdnsUnicast } from '@apple-protocols/core/discovery';
import {
    AIRPLAY_SERVICE,
    describeFlags,
    getPairingRequirement,
    getProtocolVersion,
    isPasswordRequired,
    isRemoteControlSupported,
    parseFeatures
} from '@apple-protocols/airplay';
import { RAOP_SERVICE } from '@apple-protocols/airplay/raop';
import { COMPANION_LINK_SERVICE } from '@apple-protocols/companion-link';
import { getDeviceModelName, lookupDeviceModel, WAKE_PORTS } from '@apple-protocols/devices';
import type { DiscoveryService, MdnsCombinedRecord, MdnsFeatures, MdnsQuery, MdnsRecord } from '@shared/contract';
import { discoverAllDevices } from '../../discovery';

const DEFAULT_TIMEOUT_MS = 4000;

const SERVICES: Record<DiscoveryService, string> = {
    airplay: AIRPLAY_SERVICE,
    companionLink: COMPANION_LINK_SERVICE,
    raop: RAOP_SERVICE
};

function seconds(timeoutMs: number | undefined): number {
    return Math.max(1, Math.round((timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000));
}

function decodeFeatures(raw: string | undefined): MdnsFeatures | null {
    if (raw === undefined || raw.length === 0) {
        return null;
    }

    try {
        const mask = parseFeatures(raw);

        return {raw, mask: `0x${mask.toString(16)}`, flags: describeFlags(mask)};
    } catch {
        return {raw, mask: '', flags: []};
    }
}

function toRecord(name: string, service: string, address: string, port: number, txt: Record<string, string>): MdnsRecord {
    const model = txt.model ?? txt.am ?? '';
    const hostname = name.replace(/\s+/g, '-');

    return {
        id: `${hostname}.local`,
        name,
        service,
        fqdn: `${hostname}.local`,
        address,
        port,
        txt,
        features: decodeFeatures(txt.features ?? txt.ft),
        model,
        modelName: model.length === 0 ? '' : getDeviceModelName(lookupDeviceModel(model)),
        pairing: getPairingRequirement(txt),
        protocolVersion: getProtocolVersion(txt),
        passwordRequired: isPasswordRequired(txt),
        remoteControl: isRemoteControlSupported(txt)
    };
}

type DiscoveryHit = {
    readonly id: string;
    readonly address: string;
    readonly txt: Record<string, string>;
    readonly service: { readonly port: number; readonly type: string };
};

function fromDiscovery(result: DiscoveryHit): MdnsRecord {
    return toRecord(result.id.replace(/\.local$/, ''), result.service.type, result.address, result.service.port, result.txt);
}

function discoveryFor(service: DiscoveryService): Discovery {
    return new Discovery(SERVICES[service] ?? AIRPLAY_SERVICE);
}

export async function scan(query: MdnsQuery): Promise<readonly MdnsRecord[]> {
    const services = query.services.map(service => service.trim()).filter(service => service.length > 0);

    if (services.length === 0) {
        throw new Error('Pick at least one service to scan for.');
    }

    const timeout = seconds(query.timeoutMs);
    const hosts = (query.hosts ?? []).map(host => host.trim()).filter(host => host.length > 0);

    if (query.mode === 'unicast' && hosts.length === 0) {
        throw new Error('A unicast scan needs at least one address.');
    }

    const found = query.mode === 'unicast' ? await mdnsUnicast(hosts, services, timeout, WAKE_PORTS) : await mdnsMulticast(services, timeout);

    return found.map(service => toRecord(service.name, service.type, service.address, service.port, service.properties));
}

export async function wake(address: string): Promise<void> {
    await Discovery.wake(address, WAKE_PORTS);
}

export async function findByAddress(service: DiscoveryService, address: string, timeoutMs?: number): Promise<MdnsRecord | null> {
    const result = await discoveryFor(service).findByAddress(address, seconds(timeoutMs), WAKE_PORTS);

    return result === null ? null : fromDiscovery(result as DiscoveryHit);
}

export async function findUntil(service: DiscoveryService, id: string, tries?: number, timeoutMs?: number): Promise<MdnsRecord> {
    const result = await discoveryFor(service).findUntil(id, tries ?? 10, timeoutMs ?? 1000);

    return fromDiscovery(result as DiscoveryHit);
}

export async function discoverAll(): Promise<readonly MdnsCombinedRecord[]> {
    const found = await discoverAllDevices();

    return found.map(entry => ({
        id: entry.id,
        name: entry.name,
        address: entry.address,
        airplay: entry.airplay === undefined ? null : fromDiscovery(entry.airplay as DiscoveryHit),
        companionLink: entry.companionLink === undefined ? null : fromDiscovery(entry.companionLink as DiscoveryHit),
        raop: entry.raop === undefined ? null : fromDiscovery(entry.raop as DiscoveryHit)
    }));
}

export function clearCache(): void {
    Discovery.clearCache();
}

export { SERVICES };
