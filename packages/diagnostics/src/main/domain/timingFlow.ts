import * as AirPlay from '@basmilius/apple-airplay';
import {
    type AccessoryKeys,
    AirPlayFeatureFlags,
    type DiscoveryResult,
    hasFeatureFlag,
    type JsonStorage,
    PtpMaster,
    selectTimingStrategy,
    TimingServer
} from '@basmilius/apple-common';
import type {
    TimingFlowMode,
    TimingFlowReport,
    TimingInspectEntry,
    TimingStrategy
} from '@shared/snapshots';
import type { DiscoveryCache } from './discoveryCache';

const POST_SETUP_OBSERVE_MS = 5000;

function formatClockIdentity(buf: Buffer): string {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(':');
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function predictNegotiation(
    mode: TimingFlowMode,
    supportsPTP: boolean,
    hasPtpMaster: boolean,
    hasTimingServer: boolean
): TimingStrategy {
    if (mode === 'none') {
        return 'None';
    }

    if (mode === 'ptp' && hasPtpMaster && supportsPTP) {
        return 'PTP';
    }

    if (mode === 'ntp' && hasTimingServer) {
        return 'NTP';
    }

    if (mode === 'auto') {
        if (supportsPTP && hasPtpMaster) {
            return 'PTP';
        }
        if (hasTimingServer) {
            return 'NTP';
        }
    }

    return 'None';
}

export async function inspectDevices(discovery: DiscoveryCache): Promise<TimingInspectEntry[]> {
    await discovery.refresh(false);
    const entries: TimingInspectEntry[] = [];

    for (const device of discovery.airplay) {
        entries.push(await probeDevice(device));
    }

    return entries;
}

async function probeDevice(device: DiscoveryResult): Promise<TimingInspectEntry> {
    const protocol = new AirPlay.Protocol(device);

    try {
        await protocol.connect();
        await protocol.fetchInfo();

        const info = protocol.receiverInfo ?? {};
        const features = protocol.receiverFeatures;

        return {
            id: device.id,
            name: String(info.name ?? device.fqdn),
            model: String(info.model ?? '?'),
            sourceVersion: String(info.sourceVersion ?? '?'),
            address: device.address,
            port: device.service.port,
            features: `0x${features.toString(16)}`,
            strategy: selectTimingStrategy(features),
            supportsPTP: hasFeatureFlag(features, AirPlayFeatureFlags.SupportsPTP),
            supportsBufferedAudio: hasFeatureFlag(features, AirPlayFeatureFlags.SupportsBufferedAudio)
        };
    } catch (err) {
        return {
            id: device.id,
            name: device.fqdn,
            model: '?',
            sourceVersion: '?',
            address: device.address,
            port: device.service.port,
            features: '0x0',
            strategy: 'None',
            supportsPTP: false,
            supportsBufferedAudio: false,
            error: err instanceof Error ? err.message : String(err)
        };
    } finally {
        try {
            protocol.disconnect();
        } catch {
            // Already closed.
        }
    }
}

export async function runFlow(
    storage: JsonStorage,
    discovery: DiscoveryCache,
    deviceId: string,
    mode: TimingFlowMode
): Promise<TimingFlowReport> {
    const device = discovery.findAirplay(deviceId);

    if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
    }

    const protocol = new AirPlay.Protocol(device);
    let timingServer: TimingServer | undefined;
    let ptpMaster: PtpMaster | undefined;

    try {
        await protocol.connect();
        await protocol.fetchInfo();

        const features = protocol.receiverFeatures;
        const supportsPTP = hasFeatureFlag(features, AirPlayFeatureFlags.SupportsPTP);
        const selectedStrategy = selectTimingStrategy(features);

        const isAppleTV = device.txt.model?.startsWith('AppleTV') ?? false;
        const isHomePod = device.txt.model?.startsWith('AudioAccessory') ?? false;

        if (!isAppleTV && !isHomePod) {
            throw new Error(`Device ${device.fqdn} is not a supported AirPlay device for the flow test.`);
        }

        let keys: AccessoryKeys;

        if (isAppleTV) {
            const credentials = storage.getCredentials(device.id, 'airplay');

            if (!credentials) {
                throw new Error(`No saved AirPlay credentials for ${device.fqdn}; pair first.`);
            }

            keys = await protocol.verify.start(credentials);
        } else {
            keys = await protocol.pairing.transient();
        }

        protocol.controlStream.enableEncryption(
            keys.accessoryToControllerKey,
            keys.controllerToAccessoryKey
        );

        const wantsPtp = mode === 'ptp' || (mode === 'auto' && supportsPTP);
        const wantsNtp = mode === 'ntp' || (mode === 'auto' && !supportsPTP);

        if (wantsPtp) {
            ptpMaster = new PtpMaster(device.address);
            protocol.usePtpMaster(ptpMaster);
        }

        if (wantsNtp) {
            timingServer = new TimingServer();
            await timingServer.listen();
            protocol.useTimingServer(timingServer);
        }

        const predictedNegotiation = predictNegotiation(mode, supportsPTP, !!ptpMaster, !!timingServer);

        await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);
        await wait(POST_SETUP_OBSERVE_MS);

        return {
            deviceId: device.id,
            deviceName: device.fqdn,
            mode,
            receiverFeatures: `0x${features.toString(16)}`,
            supportsPTP,
            selectedStrategy,
            predictedNegotiation,
            timingServerPort: timingServer?.port ?? null,
            ptpEventPort: ptpMaster?.eventPort ?? null,
            ptpGeneralPort: ptpMaster?.generalPort ?? null,
            ptpClockIdentity: ptpMaster ? formatClockIdentity(ptpMaster.clockIdentity) : null,
            ptpStats: ptpMaster ? {
                state: ptpMaster.state,
                syncsSent: ptpMaster.syncsSent,
                announcesSent: ptpMaster.announcesSent,
                delayReqsReceived: ptpMaster.delayReqsReceived,
                delayRespsSent: ptpMaster.delayRespsSent,
                announcesReceived: ptpMaster.announcesReceived
            } : null
        };
    } finally {
        try {
            protocol.disconnect();
        } catch {
            // Ignore.
        }

        timingServer?.close();
        ptpMaster?.stop();
    }
}
