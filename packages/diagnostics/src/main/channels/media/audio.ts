import { dialog } from 'electron';
import { Protocol } from '@basmilius/apple-airplay';
import { type AccessoryKeys, PtpMaster } from '@basmilius/apple-common';
import type { MediaController } from '@basmilius/apple-sdk';
import type { AudioSourceKind, AudioStatus, AudioTelemetry, PtpTelemetry } from '@shared/contract';
import { handle } from '../../ipc';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';
import { buildSource, type BuiltSource } from './sources';

/** Limit status pushes to four per second to avoid flooding the renderer. */
const TELEMETRY_INTERVAL = 250;

/** The receiver drops an idle audio session, the same cadence the SDK keeps for its own streams. */
const FEEDBACK_INTERVAL = 2000;

const DEFAULT_VOLUME_DB = -20;

const FILE_FILTERS: Partial<Record<AudioSourceKind, Electron.FileFilter[]>> = {
    wav: [{name: 'WAV audio', extensions: ['wav']}],
    mp3: [{name: 'MP3 audio', extensions: ['mp3']}],
    ogg: [{name: 'Ogg audio', extensions: ['ogg', 'oga']}],
    pcm: [{name: 'Raw PCM', extensions: ['pcm', 'raw']}]
};

type AudioState = {
    mode: AudioStatus['mode'];
    playing: boolean;
    source: string | null;
    volumeDb: number | null;
    ptpExperiment: boolean;
    startedAt: number | null;
    error: string | null;
    built: BuiltSource | null;
    /** Only set for the PTP experiment, which runs its own low-level protocol. */
    ptpProtocol: Protocol | null;
    ptpMaster: PtpMaster | null;
    feedback: NodeJS.Timeout | null;
    telemetry: NodeJS.Timeout | null;
};

/** URL playback uses a receiver-owned session; PCM streaming uses a separate RTP session. */
export function registerAudioChannels(context: ChannelContext): void {
    const states = new Map<string, AudioState>();

    const stateOf = (deviceId: string): AudioState => {
        const existing = states.get(deviceId);

        if (existing) {
            return existing;
        }

        const created: AudioState = {
            mode: 'idle',
            playing: false,
            source: null,
            volumeDb: null,
            ptpExperiment: false,
            startedAt: null,
            error: null,
            built: null,
            ptpProtocol: null,
            ptpMaster: null,
            feedback: null,
            telemetry: null
        };

        states.set(deviceId, created);

        return created;
    };

    const sessionOf = (deviceId: string): DeviceSession => {
        const session = context.sessions.sessions.get(deviceId);

        if (!session) {
            throw new Error(`No session for device '${deviceId}'. Connect first.`);
        }

        return session;
    };

    const mediaOf = (deviceId: string): MediaController => {
        const device = sessionOf(deviceId).device;

        if (device === null) {
            throw new Error(`Device '${deviceId}' is not connected.`);
        }

        return device.media;
    };

    /* The SDK streams over a protocol of its own, which is where the counters live. */
    const readTelemetry = (deviceId: string): AudioTelemetry | null => {
        const state = stateOf(deviceId);
        const protocol = state.ptpProtocol ?? context.sessions.sessions.get(deviceId)?.device?.airplay.streamProtocol ?? null;
        const stats = protocol?.audioStream?.stats ?? null;

        if (stats === null) {
            return null;
        }

        return {
            packetsSent: stats.packetsSent,
            retransmitRequests: stats.retransmitRequests,
            retransmitsFulfilled: stats.retransmitsFulfilled,
            retransmitsFailed: stats.retransmitsFailed,
            packetLossRate: stats.packetLossRate,
            totalBytesSent: stats.totalBytesSent,
            ptp: ptpTelemetry(state.ptpMaster)
        };
    };

    const statusOf = (deviceId: string): AudioStatus => {
        const state = stateOf(deviceId);

        return {
            deviceId,
            mode: state.mode,
            playing: state.playing,
            source: state.source,
            volumeDb: state.volumeDb,
            ptpExperiment: state.ptpExperiment,
            startedAt: state.startedAt,
            error: state.error,
            telemetry: state.playing && state.mode === 'stream' ? readTelemetry(deviceId) : null
        };
    };

    const push = (deviceId: string): void => {
        context.send('audio:status', statusOf(deviceId));
    };

    const finish = (deviceId: string, error: unknown | null): void => {
        const state = stateOf(deviceId);

        if (state.telemetry !== null) {
            clearInterval(state.telemetry);
            state.telemetry = null;
        }

        if (state.feedback !== null) {
            clearInterval(state.feedback);
            state.feedback = null;
        }

        state.built?.dispose();
        state.built = null;
        state.ptpProtocol = null;
        state.ptpMaster = null;
        state.playing = false;
        state.mode = 'idle';
        state.error = error === null ? null : error instanceof Error ? error.message : String(error);

        push(deviceId);
    };

    handle('audio:playUrl', async request => {
        const state = stateOf(request.deviceId);
        const media = mediaOf(request.deviceId);

        state.mode = 'url';
        state.playing = true;
        state.source = request.url;
        state.volumeDb = null;
        state.ptpExperiment = false;
        state.startedAt = Date.now();
        state.error = null;
        push(request.deviceId);

        try {
            await media.playUrl(request.url, request.position ?? 0);
        } catch (error) {
            finish(request.deviceId, error);

            throw error;
        }

        push(request.deviceId);
    });

    handle('audio:stopUrl', request => {
        mediaOf(request.deviceId).stopPlayUrl();
        finish(request.deviceId, null);
    });

    handle('audio:waitForEnd', async request => {
        await mediaOf(request.deviceId).waitForPlaybackEnd();
        finish(request.deviceId, null);
    });

    /* Return when streaming starts; completion and failures arrive through `audio:status`. */
    handle('audio:stream', async request => {
        const session = sessionOf(request.deviceId);
        const state = stateOf(request.deviceId);

        if (state.playing) {
            throw new Error('This device is already playing. Stop it first.');
        }

        const built = await buildSource(request.source);
        const volumeDb = request.volumeDb ?? DEFAULT_VOLUME_DB;
        const ptp = request.ptpExperiment === true;

        state.mode = 'stream';
        state.playing = true;
        state.source = built.description;
        state.volumeDb = volumeDb;
        state.ptpExperiment = ptp;
        state.startedAt = Date.now();
        state.error = null;
        state.built = built;
        state.telemetry = setInterval(() => push(request.deviceId), TELEMETRY_INTERVAL);

        push(request.deviceId);

        const credentials = context.storage.storage.getCredentials(session.discovered.services.airplay?.id ?? session.discovered.id, 'airplay');
        const running = ptp ? streamOverPtp(session, state, built, volumeDb, credentials) : mediaOf(request.deviceId).streamAudio(built.source, volumeDb);

        running.then(
            () => finish(request.deviceId, null),
            error => finish(request.deviceId, error)
        );
    });

    handle('audio:stopStream', request => {
        const state = stateOf(request.deviceId);

        if (state.ptpProtocol !== null) {
            state.ptpProtocol.disconnect();
        } else {
            mediaOf(request.deviceId).stopStreamAudio();
        }

        state.built?.dispose();
    });

    handle('audio:status', request => statusOf(request.deviceId));

    handle('audio:pickFile', async request => {
        const result = await dialog.showOpenDialog({
            title: 'Pick an audio file',
            properties: ['openFile'],
            filters: FILE_FILTERS[request.kind] ?? [{name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'pcm', 'raw']}]
        });

        return result.canceled ? null : (result.filePaths[0] ?? null);
    });
}

/**
 * Tests a separate {@link Protocol} with a PTP grandmaster.
 * The SDK disables PTP because it produces silent playback on PTP-capable receivers.
 */
async function streamOverPtp(session: DeviceSession, state: AudioState, built: BuiltSource, volumeDb: number, credentials: Parameters<Protocol['verify']['start']>[0] | undefined): Promise<void> {
    const service = session.discovered.services.airplay;

    if (!service) {
        throw new Error('This device advertises no AirPlay service.');
    }

    const protocol = new Protocol(service);
    const master = new PtpMaster(service.address);

    protocol.usePtpMaster(master);
    state.ptpProtocol = protocol;
    state.ptpMaster = master;

    try {
        await protocol.connect();
        await protocol.fetchInfo();

        const keys = await handshake(protocol, credentials);

        protocol.controlStream.enableEncryption(keys.accessoryToControllerKey, keys.controllerToAccessoryKey);

        await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

        // A fresh AirPlay audio session starts silent.
        await protocol.controlStream.setParameter('volume', String(volumeDb));

        state.feedback = setInterval(() => {
            void protocol.feedback().catch(() => undefined);
        }, FEEDBACK_INTERVAL);

        await protocol.setupAudioStream(built.source);
    } finally {
        protocol.disconnect();
    }
}

async function handshake(protocol: Protocol, credentials: Parameters<Protocol['verify']['start']>[0] | undefined): Promise<AccessoryKeys> {
    if (credentials) {
        return await protocol.verify.start(credentials);
    }

    await protocol.pairing.start();

    return await protocol.pairing.transient();
}

function ptpTelemetry(master: PtpMaster | null): PtpTelemetry | null {
    if (master === null) {
        return null;
    }

    return {
        state: master.state,
        eventPort: master.eventPort,
        generalPort: master.generalPort,
        clockIdentity: master.clockIdentity.toString('hex'),
        syncsSent: master.syncsSent,
        announcesSent: master.announcesSent,
        announcesReceived: master.announcesReceived,
        delayReqsReceived: master.delayReqsReceived,
        delayRespsSent: master.delayRespsSent
    };
}
