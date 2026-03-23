import { type AudioSource, Context, type DeviceIdentity, type DiscoveryResult, getMacAddress, InvalidResponseError, PlaybackError, randomInt64, SetupError, type TimingServer, uuid, waitFor } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { Pairing, Verify } from './pairing';
import AudioStream from './audioStream';
import ControlStream from './controlStream';
import DataStream from './dataStream';
import EventStream from './eventStream';

import { decodeFeatures, hasFeature, SENDER_FEATURES_AUDIO, SENDER_FEATURES_REMOTE_CONTROL } from './features';

const FEEDBACK_INTERVAL = 2000;
const PLAY_RETRIES = 3;
const PLAYBACK_POLL_INTERVAL = 1000;
const PLAYBACK_IDLE_THRESHOLD = 5;

export type PlaybackInfo = {
    duration?: number;
    position?: number;
    rate?: number;
    readyToPlay?: boolean;
    error?: { code: number; domain: string };
};

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

    get audioStream(): AudioStream | undefined {
        return this.#audioStream;
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
    #audioStream?: AudioStream;
    #dataStream?: DataStream;
    #eventStream?: EventStream;
    #playUrlFeedbackInterval?: NodeJS.Timeout;
    #receiverFeatures: bigint = 0n;
    #receiverInfo?: Record<string, any>;
    #timingServer?: TimingServer;

    constructor(discoveryResult: DiscoveryResult, identity?: Partial<DeviceIdentity>) {
        this.#context = new Context(discoveryResult.id, identity);
        this.#discoveryResult = discoveryResult;
        this.#sessionUUID = uuid();
        this.#controlStream = new ControlStream(this.#context, discoveryResult.address, discoveryResult.service.port);
        this.#pairing = new Pairing(this);
        this.#verify = new Verify(this);
    }

    get receiverFeatures(): bigint {
        return this.#receiverFeatures;
    }

    get receiverInfo(): Record<string, any> | undefined {
        return this.#receiverInfo;
    }

    hasReceiverFeature(feature: bigint): boolean {
        return hasFeature(this.#receiverFeatures, feature);
    }

    async connect(): Promise<void> {
        await this.#controlStream.connect();
    }

    async fetchInfo(): Promise<Record<string, any>> {
        const response = await this.#controlStream.get('/info');

        if (response.status !== 200) {
            this.context.logger.warn('[protocol]', `GET /info failed: ${response.status}`);
            return {};
        }

        const info = Plist.parse(await response.arrayBuffer()) as Record<string, any>;
        this.#receiverInfo = info;

        const receiverSourceVersion = info.sourceVersion as string | undefined;

        if (info.features != null) {
            this.#receiverFeatures = BigInt(info.features);
        }

        this.context.logger.info('[protocol]', `Receiver: ${info.name ?? 'unknown'}, model=${info.model ?? '?'}, sourceVersion=${receiverSourceVersion ?? '?'}`);
        this.context.logger.info('[protocol]', `Receiver features: ${decodeFeatures(this.#receiverFeatures).join(', ')}`);

        if (info.initialVolume != null) {
            this.context.logger.info('[protocol]', `Receiver initial volume: ${info.initialVolume}`);
        }

        // Use the receiver's sourceVersion if it's lower than ours, to avoid
        // claiming capabilities the receiver doesn't understand.
        if (receiverSourceVersion) {
            const ours = parseFloat(this.#context.identity.sourceVersion);
            const theirs = parseFloat(receiverSourceVersion);

            if (theirs < ours) {
                this.context.logger.info('[protocol]', `Capping sourceVersion from ${this.#context.identity.sourceVersion} to ${receiverSourceVersion}`);
                (this.#context.identity as any).sourceVersion = receiverSourceVersion;
            }
        }

        return info;
    }

    destroy(): void {
        this.#audioStream?.close();
        this.#controlStream.destroy();
        this.#dataStream?.destroy();
        this.#eventStream?.destroy();
    }

    disconnect(): void {
        try {
            this.#audioStream?.close();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error closing audio stream', err);
        }

        try {
            this.#dataStream?.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying data stream', err);
        }

        try {
            this.#eventStream?.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying event stream', err);
        }

        try {
            this.#controlStream.destroy();
        } catch (err) {
            this.#context.logger.warn('[protocol]', 'Error destroying control stream', err);
        }

        this.#stopPlayUrlFeedback();
        this.#audioStream = undefined;
        this.#dataStream = undefined;
        this.#eventStream = undefined;
        this.#timingServer = undefined;
    }

    async feedback(): Promise<void> {
        // note: Default feedback interval is 2s, so a timeout of 1.9s should be fine.
        await this.#controlStream.post('/feedback', undefined, undefined, 1900);
    }

    async setupDataStream(sharedSecret: Buffer, onBeforeConnect?: () => void): Promise<void> {
        const seed = randomInt64();

        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, {
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

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed to setup data stream.', response.status, response.statusText, await response.text());
            throw new SetupError('Failed to setup data stream.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;
        const dataPort = plist.streams[0].dataPort & 0xFFFF;
        this.context.logger.net('[protocol]', `Connecting to data stream on port ${dataPort}...`);

        this.#dataStream = new DataStream(this.context, this.#controlStream.address, dataPort);
        this.#dataStream.setup(sharedSecret, seed);

        onBeforeConnect?.();

        await this.#dataStream.connect();
    }

    async #performSetup(body: Record<string, string | number | boolean>, sharedSecret?: Buffer): Promise<any> {
        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, body);

        if (response.status !== 200) {
            this.context.logger.error('[protocol]', 'Failed SETUP request.', response.status, response.statusText, await response.text());
            throw new SetupError('SETUP request failed.');
        }

        const plist = Plist.parse(await response.arrayBuffer()) as any;

        if (plist.enabledFeatures != null) {
            this.context.logger.info('[protocol]', `Receiver enabled features: 0x${BigInt(plist.enabledFeatures).toString(16)}`);
        }

        if (plist.keepAlivePort != null) {
            this.context.logger.info('[protocol]', `Receiver keep-alive port: ${plist.keepAlivePort}`);
        }

        return plist;
    }

    #setupBody(pairingId: Buffer, features: bigint): Record<string, any> {
        const id = this.#context.identity;

        return {
            deviceID: pairingId.toString(),
            features: Number(features & 0xFFFFFFFFn),
            featuresEx: Number(features >> 32n),
            macAddress: getMacAddress().toUpperCase(),
            model: id.model,
            name: id.name,
            osBuildVersion: id.osBuildVersion,
            osName: id.osName,
            osVersion: id.osVersion,
            sourceVersion: id.sourceVersion,
            sessionUUID: this.#sessionUUID,
            sessionCorrelationUUID: this.#sessionUUID.toUpperCase()
        };
    }

    async setupEventStream(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const body: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_REMOTE_CONTROL),
            timingProtocol: 'None',
            isRemoteControlOnly: true
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const plist = await this.#performSetup(body, sharedSecret);
        const eventPort = plist.eventPort & 0xFFFF;

        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    async setupEventStreamForAudioStreaming(sharedSecret: Buffer, pairingId: Buffer): Promise<void> {
        const groupUUID = uuid().toUpperCase();

        const body: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_AUDIO),
            groupContainsGroupLeader: false,
            groupUUID,
            isMultiSelectAirPlay: true,
            senderSupportsRelay: false,
            statsCollectionEnabled: false,
            supportsGroupCohesion: true,
            timingProtocol: 'None',
            updateSessionRequest: false
        };

        if (this.#timingServer) {
            body.timingPort = this.#timingServer.port;
            body.timingProtocol = 'NTP';
        }

        const plist = await this.#performSetup(body, sharedSecret);
        const eventPort = plist.eventPort & 0xFFFF;

        this.context.logger.net('[protocol]', `Connecting to event stream on port ${eventPort}...`);

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);

        await this.#eventStream.connect();
        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);
    }

    async playUrl(url: string, sharedSecret: Buffer, pairingId: Buffer, position: number = 0): Promise<void> {
        const setupBody: Record<string, any> = {
            ...this.#setupBody(pairingId, SENDER_FEATURES_AUDIO),
            isMultiSelectAirPlay: true,
            groupContainsGroupLeader: false,
            senderSupportsRelay: false,
            statsCollectionEnabled: false
        };

        if (this.#timingServer) {
            setupBody.timingPort = this.#timingServer.port;
            setupBody.timingProtocol = 'NTP';
        } else {
            setupBody.timingProtocol = 'None';
        }

        const setupResponse = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, setupBody);

        if (setupResponse.status !== 200) {
            throw new SetupError(`Failed to setup for playback: ${setupResponse.status}`);
        }

        const setupPlist = Plist.parse(await setupResponse.arrayBuffer()) as any;
        const eventPort = setupPlist.eventPort & 0xFFFF;

        this.#eventStream?.destroy();
        this.#eventStream = new EventStream(this.#context, this.#controlStream.address, eventPort);
        this.#eventStream.setup(sharedSecret);
        await this.#eventStream.connect();

        // Start feedback loop before RECORD/play (keeps session alive).
        this.#startPlayUrlFeedback();

        await this.#controlStream.record(`/${this.#controlStream.sessionId}`);

        // Retry POST /play on 500 errors (device may need time to prepare).
        let lastStatus = 0;

        for (let retry = 0; retry < PLAY_RETRIES; retry++) {
            const response = await this.#controlStream.post('/play', {
                'Content-Location': url,
                'Start-Position-Seconds': position,
                uuid: this.#sessionUUID.toUpperCase(),
                streamType: 1,
                mediaType: 'file',
                volume: 1.0,
                rate: 1.0,
                clientBundleID: 'com.basmilius.apple-protocols',
                clientProcName: this.#context.identity.name,
                osBuildVersion: this.#context.identity.osBuildVersion,
                model: this.#context.identity.model,
                SenderMACAddress: getMacAddress().toUpperCase()
            });

            lastStatus = response.status;
            this.context.logger.info('[protocol]', `play_url response: ${lastStatus} (attempt ${retry + 1}/${PLAY_RETRIES})`);

            if (lastStatus === 200) {
                break;
            }

            if (lastStatus === 500) {
                this.context.logger.warn('[protocol]', 'play_url returned 500, retrying...');
                await waitFor(1000);
                continue;
            }

            if (lastStatus >= 400) {
                this.#stopPlayUrlFeedback();
                throw new PlaybackError(`Failed to play URL: ${lastStatus}`);
            }
        }

        if (lastStatus !== 200) {
            this.#stopPlayUrlFeedback();
            throw new PlaybackError(`Failed to play URL after ${PLAY_RETRIES} retries: ${lastStatus}`);
        }

        await this.#putProperty('isInterestedInDateRange', {value: true});
        await this.#putProperty('actionAtItemEnd', {value: 0});
        await this.#controlStream.post('/rate?value=1.000000');
        await this.#putProperty('forwardEndTime', {value: {flags: 0, value: 0, epoch: 0, timescale: 0}});
        await this.#putProperty('reverseEndTime', {value: {flags: 0, value: 0, epoch: 0, timescale: 0}});
    }

    async getPlaybackInfo(): Promise<PlaybackInfo | null> {
        try {
            const response = await this.#controlStream.get('/playback-info');

            if (!response.ok) {
                return null;
            }

            const body = await response.arrayBuffer();

            if (body.byteLength === 0) {
                return {};
            }

            return Plist.parse(body) as PlaybackInfo;
        } catch {
            return null;
        }
    }

    async waitForPlaybackEnd(): Promise<void> {
        let playbackStarted = false;
        let idleCount = 0;

        while (true) {
            const info = await this.getPlaybackInfo();

            if (!info) {
                this.context.logger.debug('[protocol]', 'Connection lost, assuming playback stopped.');
                break;
            }

            if (info.error) {
                this.#stopPlayUrlFeedback();
                throw new PlaybackError(`Playback error: ${info.error.code} (${info.error.domain})`);
            }

            if (info.duration !== undefined) {
                playbackStarted = true;
                idleCount = 0;
            } else if (playbackStarted) {
                idleCount++;

                if (idleCount >= PLAYBACK_IDLE_THRESHOLD) {
                    this.context.logger.debug('[protocol]', 'Playback ended.');
                    break;
                }
            }

            await waitFor(PLAYBACK_POLL_INTERVAL);
        }

        this.#stopPlayUrlFeedback();
    }

    stopPlayUrl(): void {
        this.#stopPlayUrlFeedback();
    }

    #startPlayUrlFeedback(): void {
        this.#stopPlayUrlFeedback();
        this.#playUrlFeedbackInterval = setInterval(async () => {
            try {
                await this.feedback();
            } catch (err) {
                this.#context.logger.warn('[protocol]', 'playUrl feedback error', err);
            }
        }, FEEDBACK_INTERVAL);
    }

    #stopPlayUrlFeedback(): void {
        if (this.#playUrlFeedbackInterval) {
            clearInterval(this.#playUrlFeedbackInterval);
            this.#playUrlFeedbackInterval = undefined;
        }
    }

    async #putProperty(property: string, body: any): Promise<void> {
        await this.#controlStream.put(`/setProperty?${property}`, body);
    }

    async setupAudioStream(source: AudioSource): Promise<void> {
        this.#audioStream = new AudioStream(this);
        await this.#audioStream.setup();
        await this.#audioStream.stream(source, this.#discoveryResult.address);
    }

    useTimingServer(timingServer: TimingServer): void {
        this.#timingServer = timingServer;
    }
}
