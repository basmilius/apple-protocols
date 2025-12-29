import { type DiscoveryResult, getMacAddress, Plist, reporter, TimingServer, uuid } from '@basmilius/apple-common';
import { randomInt64 } from './utils';
import DataStream from './dataStream';
import EventStream from './eventStream';
import Pairing from './pairing';
import RTSP from './rtsp';
import Verify from './verify';

export default class AirPlay {
    get device(): DiscoveryResult {
        return this.#device;
    }

    get dataStream(): DataStream | undefined {
        return this.#dataStream;
    }

    get eventStream(): EventStream | undefined {
        return this.#eventStream;
    }

    get pairing(): Pairing {
        return this.#pairing;
    }

    get rtsp(): RTSP {
        return this.#rtsp;
    }

    get sessionUUID(): string {
        return this.#sessionUUID;
    }

    get verify(): Verify {
        return this.#verify;
    }

    readonly #device: DiscoveryResult;
    readonly #pairing: Pairing;
    readonly #rtsp: RTSP;
    readonly #verify: Verify;
    readonly #sessionUUID: string;
    #dataStream?: DataStream;
    #eventStream?: EventStream;
    #timingServer?: TimingServer;

    constructor(device: DiscoveryResult) {
        this.#device = device;
        this.#rtsp = new RTSP(device.address, device.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
        this.#sessionUUID = uuid();
    }

    async connect(): Promise<void> {
        await this.#rtsp.connect();
    }

    async disconnect(): Promise<void> {
        await this.#rtsp.disconnect();
    }

    async feedback(): Promise<void> {
        await this.#rtsp.post('/feedback');
    }

    async setupDataStream(sharedSecret: Buffer): Promise<void> {
        const seed = randomInt64();
        const request = Plist.serialize({
            streams: [
                {
                    controlType: 2,
                    channelID: uuid().toUpperCase(),
                    seed,
                    clientUUID: uuid().toUpperCase(),
                    type: 130,
                    wantsDedicatedSocket: true,
                    clientTypeUUID: '1910A70F-DBC0-4242-AF95-115DB30604E1'
                }
            ]
        });

        const response = await this.#rtsp.setup(`/${this.rtsp.sessionId}`, Buffer.from(request), {
            'Content-Type': 'application/x-apple-binary-plist'
        });

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const dataPort = plist.streams[0].dataPort & 0xFFFF;
        reporter.net(`Connecting to data stream on port ${dataPort}...`);

        this.#dataStream = new DataStream(this.#rtsp.address, dataPort);
        await this.#dataStream.setup(sharedSecret, seed);
        await this.#dataStream.connect();
    }

    async setupEventStream(pairingId: Buffer, sharedSecret: Buffer): Promise<void> {
        const body: Record<string, string | boolean | number> = {
            deviceID: pairingId.toString(),
            macAddress: getMacAddress().toUpperCase(),
            name: 'iPhone van Bas',
            model: 'iPhone16,2',
            osBuildVersion: '23C5027f',
            osName: 'iPhone OS',
            osVersion: '26.2',
            sourceVersion: '925.3.2',
            sessionUUID: this.#sessionUUID,
            sessionCorrelationUUID: uuid().toUpperCase(),
            timingProtocol: 'None',
            isRemoteControlOnly: true,
            statsCollectionEnabled: false,
            updateSessionRequest: false
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const request = Plist.serialize(body);
        const response = await this.#rtsp.setup(`/${this.rtsp.sessionId}`, Buffer.from(request), {
            'Content-Type': 'application/x-apple-binary-plist'
        });

        if (response.status !== 200) {
            reporter.error('Cannot setup event stream', response.status, response.statusText, await response.text());

            throw new Error('Cannot setup event stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const eventPort = plist.eventPort & 0xFFFF;
        reporter.net(`Connecting to event stream on port ${eventPort}...`);

        this.#eventStream = new EventStream(this.#rtsp.address, eventPort);
        await this.#eventStream.setup(sharedSecret);
        await this.#eventStream.connect();

        await this.#rtsp.record(`/${this.rtsp.sessionId}`);
    }

    async setupTimingServer(timing: TimingServer): Promise<void> {
        this.#timingServer = timing;
    }
}
