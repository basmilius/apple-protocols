import { Context, type DiscoveryResult, getMacAddress, randomInt64, type TimingServer, uuid } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { Pairing, Verify } from './pairing';
import ControlStream from './controlStream';
import DataStream from './dataStream';
import EventStream from './eventStream';

export default class Protocol {
    get context(): Context {
        return this.#context;
    }

    get controlStream(): ControlStream {
        return this.#controlStream;
    }

    get dataStream(): DataStream | undefined {
        return this.#dataStream;
    }

    get discoveryResult(): DiscoveryResult {
        return this.#discoveryResult;
    }

    get eventStream(): EventStream | undefined {
        return this.#eventStream;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get sessionUUID(): string {
        return this.#sessionUUID;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #context: Context;
    readonly #controlStream: ControlStream;
    readonly #discoveryResult: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #sessionUUID: string;
    readonly #verify: Verify;
    #dataStream?: DataStream;
    #eventStream?: EventStream;
    #timingServer?: TimingServer;

    constructor(discoveryResult: DiscoveryResult) {
        this.#context = new Context(discoveryResult.id);
        this.#discoveryResult = discoveryResult;
        this.#sessionUUID = uuid();
        this.#controlStream = new ControlStream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    async connect(): Promise<void> {
        await this.#controlStream.connect();
    }

    async destroy(): Promise<void> {
        await this.#controlStream.destroy();
        await this.#dataStream?.destroy();
        await this.#eventStream?.destroy();
    }

    async disconnect(): Promise<void> {
        await this.#controlStream.disconnect();
        await this.#dataStream?.disconnect();
        await this.#eventStream?.disconnect();
    }

    async feedback(): Promise<void> {
        // note: Default feedback interval is 2s, so a timeout of 1.9s should be fine.
        await this.#controlStream.post('/feedback', undefined, undefined, 1900);
    }

    async setupDataStream(sharedSecret: Buffer, onBeforeConnect?: () => void): Promise<void> {
        const seed = randomInt64();
        const request = Plist.serialize({
            streams: [{
                controlType: 2,
                channelID: uuid().toUpperCase(),
                seed,
                clientUUID: uuid().toUpperCase(),
                type: 130,
                wantsDedicatedSocket: true,
                clientTypeUUID: '1910A70F-DBC0-4242-AF95-115DB30604E1'
            }]
        });

        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, Buffer.from(request), {
            'Content-Type': 'application/x-apple-binary-plist'
        });

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed to setup data stream.', response.status, response.statusText, await response.text());
            throw new Error('Failed to setup data stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const dataPort = plist.streams[0].dataPort & 0xFFFF;
        this.context.logger.net('[protocol]', `Connecting to data stream on port ${dataPort}...`);

        this.#dataStream = new DataStream(this.context, this.#controlStream.address, dataPort);
        this.#dataStream.setup(sharedSecret, seed);

        onBeforeConnect?.();

        await this.#dataStream.connect();
    }

    async setupEventStream(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const body: Record<string, string | number | boolean> = {
            deviceID: pairingId.toString(),
            macAddress: getMacAddress().toUpperCase(),
            name: 'Homey Pro',
            model: 'iPhone16,2',
            osBuildVersion: '18C66',
            osName: 'iPhone OS',
            osVersion: '14.3',
            sourceVersion: '320.20',
            sessionUUID: this.#sessionUUID,
            timingProtocol: 'None',
            isRemoteControlOnly: true
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const request = Plist.serialize(body);
        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, Buffer.from(request), {
            'Content-Type': 'application/x-apple-binary-plist'
        });

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed to setup event stream.', response.status, response.statusText, await response.text());
            throw new Error('Failed to setup event stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const eventPort = plist.eventPort & 0xFFFF;
        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    async setupEventStreamForAudioStreaming(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const groupUUID = uuid().toUpperCase();

        const body: Record<string, string | number | boolean> = {
            deviceID: pairingId.toString(),
            groupContainsGroupLeader: false,
            groupUUID,
            isMultiSelectAirPlay: true,
            macAddress: getMacAddress().toUpperCase(),
            model: 'iPhone16,2',
            name: 'Homey Pro',
            osBuildVersion: '22A3354',
            osName: 'iPhone OS',
            osVersion: '18.0',
            senderSupportsRelay: false,
            sessionCorrelationUUID: this.#sessionUUID.toUpperCase(),
            sessionUUID: this.#sessionUUID.toUpperCase(),
            sourceVersion: '935.7.1',
            statsCollectionEnabled: false,
            supportsGroupCohesion: true,
            timingProtocol: 'None',
            updateSessionRequest: false
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const request = Plist.serialize(body);
        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, Buffer.from(request), {
            'Content-Type': 'application/x-apple-binary-plist'
        });

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed to setup event stream.', response.status, response.statusText, await response.text());
            throw new Error('Failed to setup event stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const eventPort = plist.eventPort & 0xFFFF;
        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    useTimingServer(timingServer: TimingServer): void {
        this.#timingServer = timingServer;
    }
}
