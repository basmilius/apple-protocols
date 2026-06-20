import { join } from 'node:path';
import { type AccessoryCredentials, Discovery, type DiscoveryResult, JsonStorage, type ProtocolType, reporter } from '@basmilius/apple-common';
import enquirer from 'enquirer';
import ora from 'ora';
import { AirPlayProxy } from './airplay/proxy';
import { CompanionLinkProxy } from './companionLink/proxy';
import type { ProtocolProxy } from './core/protocolProxy';
import { ProxyTap } from './core/tap';
import { ProxyStore } from './store';

/** enquirer is published as CommonJS; pull `prompt` off the default export so it resolves under Bun's ESM loader. */
const prompt = (enquirer as unknown as {prompt: <T>(questions: unknown) => Promise<T>}).prompt;

/** Shared options every protocol proxy is constructed with. */
type ProxyOptions = {
    readonly device: DiscoveryResult;
    readonly credentials: AccessoryCredentials;
    readonly store: ProxyStore;
    readonly tap: ProxyTap;
    readonly pin: string;
    readonly listenPort: number;
    readonly instanceName: string;
};

/** Per-protocol configuration driving the generic proxy flow. */
type ProxyConfig = {
    readonly label: string;
    readonly discover: () => Promise<DiscoveryResult[]>;
    readonly credentialKey: ProtocolType;
    readonly listenPort: number;
    readonly create: (options: ProxyOptions) => ProtocolProxy;
};

/** The protocols the proxy can run. */
const CONFIGS: Record<string, ProxyConfig> = {
    'companion-link': {
        label: 'Companion Link',
        discover: () => Discovery.companionLink().find(),
        credentialKey: 'companionLink',
        listenPort: 49152,
        create: (options) => new CompanionLinkProxy(options)
    },
    'airplay': {
        label: 'AirPlay',
        discover: () => Discovery.airplay().find(),
        credentialKey: 'airplay',
        listenPort: 7000,
        create: (options) => new AirPlayProxy(options)
    }
};

/**
 * Entry point for the Apple protocols MITM proxy. Advertises a "(Proxy)" device, terminates the
 * controller's pairing, and relays the decrypted traffic to a real device while logging it.
 */
async function main(): Promise<void> {
    reporter.enable('info');
    reporter.enable('warn');
    reporter.enable('error');

    const {protocol} = await prompt<{protocol: string}>({
        name: 'protocol',
        type: 'select',
        message: 'Which protocol do you want to proxy?',
        choices: Object.entries(CONFIGS).map(([name, config]) => ({message: config.label, name}))
    });

    const config = CONFIGS[protocol];

    if (!config) {
        console.log('Unknown protocol.');
        return;
    }

    const storage = new JsonStorage();
    await storage.load();

    const store = new ProxyStore();
    store.load();

    const device = await selectDevice(config);

    if (!device) {
        console.log(`No ${config.label} devices found.`);
        return;
    }

    const credentials = storage.getCredentials(device.id, config.credentialKey);

    if (!credentials) {
        console.log(`No stored ${config.label} credentials for ${device.fqdn}.`);
        console.log('Pair the proxy with the real device first (via the diagnostics pairing tool), then retry.');
        return;
    }

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const instanceName = `${stripLocal(device.fqdn)} (Proxy)`;
    const capturePath = join(process.cwd(), `${protocol}-capture-${Date.now()}.jsonl`);
    const tap = new ProxyTap(protocol, capturePath);

    const proxy = config.create({
        device,
        credentials,
        store,
        tap,
        pin,
        listenPort: config.listenPort,
        instanceName
    });

    await proxy.start();

    console.log('');
    console.log(`  Proxy advertised as: ${instanceName}`);
    console.log(`  Relaying to:         ${device.fqdn} (${device.address}:${device.service.port})`);
    console.log(`  Pairing PIN:         ${pin}`);
    console.log(`  Capture file:        ${capturePath}`);
    console.log('');
    console.log('On your iPhone/Mac, connect to the proxy device and enter the PIN above. Press Ctrl+C to stop.');

    const shutdown = async () => {
        console.log('\nStopping proxy…');
        await proxy.stop();
        tap.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

/**
 * Discovers devices for the given protocol and prompts the user to choose the relay target.
 *
 * @param config - The protocol configuration.
 * @returns The selected device, or undefined if none were found.
 */
async function selectDevice(config: ProxyConfig): Promise<DiscoveryResult | undefined> {
    const spinner = ora(`Searching for ${config.label} devices…`).start();
    const devices = await config.discover();

    if (devices.length === 0) {
        spinner.fail(`No ${config.label} devices found`);
        return undefined;
    }

    spinner.succeed(`Found ${devices.length} ${config.label} device(s)`);

    const {id} = await prompt<{id: string}>({
        name: 'id',
        type: 'select',
        message: 'Which device should the proxy relay to?',
        choices: devices
            .sort((a, b) => a.fqdn.localeCompare(b.fqdn))
            .map((device) => ({message: device.fqdn, name: device.id}))
    });

    return devices.find((device) => device.id === id);
}

/** Removes a trailing `.local` from a host name for display. */
function stripLocal(name: string): string {
    return name.replace(/\.local\.?$/, '');
}

main().catch((error) => {
    console.error('Proxy failed:', error);
    process.exit(1);
});
