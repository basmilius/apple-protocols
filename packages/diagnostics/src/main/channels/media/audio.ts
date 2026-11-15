import { dialog } from 'electron';
import { type AudioPlayback, connect, PtpMaster, toTarget } from '@corewire/airplay';
import type { AccessoryCredentials } from '@corewire/core/pairing';
import type { MediaControl, MediaPlayback } from '@corewire/devices';
import type { AudioSourceKind, AudioStatus, AudioTelemetry, PtpTelemetry } from '@shared/contract';
import { handle } from '../../ipc';
import type { DeviceSession } from '../../session';
import type { ChannelContext } from '../context';
import { buildSource, type BuiltSource } from './sources';

/** Limit status pushes to four per second to avoid flooding the renderer. */
const TELEMETRY_INTERVAL = 250;

const DEFAULT_VOLUME_DB = -20;

const FILE_FILTERS: Partial<Record<AudioSourceKind, Electron.FileFilter[]>> = {
    wav: [{name: 'WAV audio', extensions: ['wav']}],
    mp3: [{name: 'MP3 audio', extensions: ['mp3']}],
    ogg: [{name: 'Ogg audio', extensions: ['ogg', 'oga']}],
    pcm: [{name: 'Raw PCM', extensions: ['pcm', 'raw']}]
};

type AudioState = {
    generation: number;
    mode: AudioStatus['mode'];
    playing: boolean;
    source: string | null;
    volumeDb: number | null;
    ptpExperiment: boolean;
    startedAt: number | null;
    error: string | null;
    built: BuiltSource | null;

    /** Only set for the PTP experiment, which runs on an AirPlay session of its own. */
    ptpAbort: AbortController | null;
    ptpPlayback: AudioPlayback | null;
    ptpMaster: PtpMaster | null;

    telemetry: NodeJS.Timeout | null;
    urlPlayback: MediaPlayback | null;
    audioPlayback: MediaPlayback | null;
};

/** The device takes 0 to 1 and sends `20 * log10(volume)` dB; -20 dB maps back to exactly -20. */
function fractionOf(volumeDb: number): number {
    return volumeDb <= -144 ? 0 : 10 ** (volumeDb / 20);
}

/** URL playback uses a receiver-owned session; PCM streaming uses a separate RTP session. */
export function registerAudioChannels(context: ChannelContext): void {
    const states = new Map<string, AudioState>();

    const stateOf = (deviceId: string): AudioState => {
        const existing = states.get(deviceId);

        if (existing) {
            return existing;
        }

        const created: AudioState = {
            generation: 0,
            mode: 'idle',
            playing: false,
            source: null,
            volumeDb: null,
            ptpExperiment: false,
            startedAt: null,
            error: null,
            built: null,
            ptpAbort: null,
            ptpPlayback: null,
            ptpMaster: null,
            telemetry: null,
            urlPlayback: null,
            audioPlayback: null
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

    const mediaOf = (deviceId: string): MediaControl => {
        const device = sessionOf(deviceId).device;

        if (device === null) {
            throw new Error(`Device '${deviceId}' is not connected.`);
        }

        return device.media;
    };

    /* The counters live on the stream's own connection, which the device does not expose, so only the PTP experiment reports them. */
    const readTelemetry = (deviceId: string): AudioTelemetry | null => {
        const state = stateOf(deviceId);
        const playback = state.ptpPlayback;
        const stats = playback?.stats ?? null;

        if (stats === null) {
            return null;
        }

        return {
            sourceBuffer: state.built?.bufferStats() ?? null,
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

    const finish = (deviceId: string, error: unknown | null, generation?: number): void => {
        const state = stateOf(deviceId);

        if (generation !== undefined && state.generation !== generation) {
            return;
        }

        if (state.telemetry !== null) {
            clearInterval(state.telemetry);
            state.telemetry = null;
        }

        state.built?.dispose();
        state.built = null;
        state.ptpAbort = null;
        state.ptpPlayback = null;
        state.ptpMaster = null;
        state.urlPlayback = null;
        state.audioPlayback = null;
        state.playing = false;
        state.mode = 'idle';
        state.error = error === null ? null : error instanceof Error ? error.message : String(error);

        push(deviceId);
    };

    handle('audio:playUrl', async request => {
        const state = stateOf(request.deviceId);
        const media = mediaOf(request.deviceId);

        if (state.playing) {
            throw new Error('This device is already playing. Stop it first.');
        }

        const generation = ++state.generation;
        state.mode = 'url';
        state.playing = true;
        state.source = request.url;
        state.volumeDb = null;
        state.ptpExperiment = false;
        state.startedAt = Date.now();
        state.error = null;
        push(request.deviceId);

        try {
            state.urlPlayback = await media.playUrl(request.url, {position: request.position ?? 0});
        } catch (error) {
            finish(request.deviceId, error, generation);

            throw error;
        }

        push(request.deviceId);
    });

    handle('audio:stopUrl', request => {
        const state = stateOf(request.deviceId);
        state.generation++;
        state.urlPlayback?.stop();
        finish(request.deviceId, null);
    });

    handle('audio:waitForEnd', async request => {
        const state = stateOf(request.deviceId);
        const generation = state.generation;
        await state.urlPlayback?.ended;
        finish(request.deviceId, null, generation);
    });

    /* Return when streaming starts; completion and failures arrive through `audio:status`. */
    handle('audio:stream', async request => {
        if (request.volumeDb !== undefined && (typeof request.volumeDb !== 'number' || !Number.isFinite(request.volumeDb) || request.volumeDb < -144 || request.volumeDb > 0)) {
            throw new RangeError('Volume must be between -144 and 0 dB.');
        }

        const session = sessionOf(request.deviceId);
        const state = stateOf(request.deviceId);

        if (state.playing) {
            throw new Error('This device is already playing. Stop it first.');
        }

        const generation = ++state.generation;
        state.playing = true;
        state.mode = 'stream';

        let built: BuiltSource;

        try {
            built = await buildSource(request.source);
        } catch (error) {
            finish(request.deviceId, error, generation);

            throw error;
        }

        if (state.generation !== generation) {
            built.dispose();

            return;
        }

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

        const running = ptp
            ? streamOverPtp(session, state, built, volumeDb, credentials)
            : mediaOf(request.deviceId).streamAudio(built.source, {volume: fractionOf(volumeDb)}).then(playback => {
                if (state.generation === generation) {
                    state.audioPlayback = playback;
                }

                return playback.ended;
            });

        running.then(
            () => finish(request.deviceId, null, generation),
            error => finish(request.deviceId, error, generation)
        );
    });

    handle('audio:stopStream', request => {
        const state = stateOf(request.deviceId);
        state.generation++;

        if (state.ptpAbort !== null) {
            state.ptpAbort.abort();
        } else {
            state.audioPlayback?.stop();
        }

        finish(request.deviceId, null);
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
 * Streams on an AirPlay session of its own with a PTP grandmaster, independent of the device's
 * session. The SDK leaves PTP off because it produces silent playback on PTP-capable receivers.
 */
async function streamOverPtp(session: DeviceSession, state: AudioState, built: BuiltSource, volumeDb: number, credentials: AccessoryCredentials | undefined): Promise<void> {
    const service = session.discovered.services.airplay;

    if (!service) {
        throw new Error('This device advertises no AirPlay service.');
    }

    const abort = new AbortController();
    const master = new PtpMaster(service.address);

    state.ptpAbort = abort;
    state.ptpMaster = master;

    const parent = await connect(toTarget(service), {credentials, signal: abort.signal});

    try {
        const playback = await parent.streamAudio(built.source, {volumeDb, ptpMaster: master, signal: abort.signal});

        if (state.ptpAbort === abort) {
            state.ptpPlayback = playback;
        }

        await playback.ended;
    } finally {
        void parent.close();
    }
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
