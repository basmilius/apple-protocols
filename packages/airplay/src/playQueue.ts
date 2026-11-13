import { type Context, PlaybackError, uuid } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import type { ControlStream } from './controlStream';
import type { EventStream } from './eventStream';
import type { PlaybackInfo } from './protocol';

/** A play queue command as decoded from `params.data` of a `POST /command`, in either direction. */
export type PlayQueueCommand = Record<string, unknown>;

/** Playback state the receiver reports for the queued item. */
export type PlayQueueState = 'loading' | 'playing' | 'paused' | 'stopped';

/** Client type of the remote control stream (RCS) that carries play queue commands. */
const RCS_CLIENT_TYPE_UUID = 'A6B27562-B43A-4F2D-B75F-82391E250194';

/** Channel suffixes tried in order for the RCS SETUP. pyatv #2948 uses RCS-1, macOS was seen sending RCS-2. */
const RCS_CHANNEL_SUFFIXES = ['RCS-1', 'RCS-2'];

/** Sends the `setRate` rate as a plist real, as pyatv does. The serializer writes whole numbers as integers otherwise. */
const RATE_AS_REAL = true;

/** Milliseconds to wait for the first `playing` state after `setRate`. */
const START_TIMEOUT = 30_000;

/** CMTime that marks a time as invalid, used for the pause times of a streaming item. */
const INVALID_TIME = {flags: 0, value: 0, epoch: 0, timescale: 0};

const FCUP_MAX_RESPONSE_SIZE = 8 * 1024 * 1024;
const FCUP_MAX_SESSION_SIZE = 32 * 1024 * 1024;
const FCUP_FETCH_TIMEOUT = 20_000;
const FCUP_MAX_IN_FLIGHT = 4;
const FCUP_SKIPPED_REQUEST_HEADERS = ['accept-encoding', 'host'];
const FCUP_SKIPPED_RESPONSE_HEADERS = ['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding'];

type PlayingSnapshot = {
    readonly position?: number;
    readonly duration?: number;
    readonly rate: number;
    readonly receivedAt: number;
};

type FetchResult = {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly data: ArrayBuffer;
};

/**
 * URL playback through the receiver's play queue: a remote control stream on the control
 * connection carries the commands, the event stream reports the playback state back.
 * Also answers `unhandledURL` (FCUP) requests by fetching the URL on behalf of the receiver.
 */
export class PlayQueueSession {
    /** Stream ID the receiver assigned to the remote control stream, once set up. */
    get streamId(): number | undefined {
        return this.#streamId;
    }

    /** The last playback state the receiver reported. */
    get state(): PlayQueueState | undefined {
        return this.#state;
    }

    /** Playback info built from the last `playing` event, with the position extrapolated to now. */
    get lastInfo(): PlaybackInfo {
        const playing = this.#playing;

        if (!playing) {
            return this.#state ? {state: this.#state} : {};
        }

        const isPlaying = this.#state === 'playing';
        let position = playing.position;

        if (position !== undefined && isPlaying) {
            position += playing.rate * (Date.now() - playing.receivedAt) / 1000;

            if (playing.duration !== undefined) {
                position = Math.min(position, playing.duration);
            }
        }

        return {
            duration: playing.duration,
            position,
            rate: isPlaying ? playing.rate : 0,
            readyToPlay: true,
            state: this.#state
        };
    }

    readonly #context: Context;
    readonly #controlStream: ControlStream;
    readonly #eventStream: EventStream;
    readonly #sessionUUID: string;
    readonly #senderMac: string;
    readonly #boundCommand: (command: PlayQueueCommand) => void;
    readonly #boundClose: () => void;
    readonly #fetchAbort: AbortController = new AbortController();
    readonly #fetchWaiters: Array<() => void> = [];
    readonly #end: Promise<void>;
    #resolveEnd!: () => void;
    #rejectEnd!: (error: Error) => void;
    #settled: boolean = false;
    #started: boolean = false;
    #fetchesInFlight: number = 0;
    #fetchedBytes: number = 0;
    #itemUUID?: string;
    #playing?: PlayingSnapshot;
    #startTimer?: NodeJS.Timeout;
    #state?: PlayQueueState;
    #streamId?: number;

    /**
     * @param context - Context of the protocol, for logging.
     * @param controlStream - Encrypted control stream the commands go out on.
     * @param eventStream - Event stream the receiver reports on.
     * @param sessionUUID - Session UUID from the first SETUP, sent as `X-Apple-Session-ID`.
     * @param senderMac - The `macAddress` sent in the first SETUP; prefix of the RCS channel ID.
     */
    constructor(context: Context, controlStream: ControlStream, eventStream: EventStream, sessionUUID: string, senderMac: string) {
        this.#context = context;
        this.#controlStream = controlStream;
        this.#eventStream = eventStream;
        this.#sessionUUID = sessionUUID;
        this.#senderMac = senderMac;
        this.#boundCommand = this.handleEvent.bind(this);
        this.#boundClose = this.#onStreamClose.bind(this);

        this.#end = new Promise<void>((resolve, reject) => {
            this.#resolveEnd = resolve;
            this.#rejectEnd = reject;
        });

        // Nobody may be waiting yet when playback fails; waitForEnd() still sees the rejection.
        this.#end.catch(() => undefined);

        eventStream.on('playQueue', this.#boundCommand);
        eventStream.on('close', this.#boundClose);
        controlStream.on('close', this.#boundClose);
    }

    /**
     * Sets up the remote control stream (SETUP type 130), trying each channel suffix once.
     *
     * @returns `false` when the receiver refused every attempt, so the caller can fall back to `/play`.
     */
    async setup(): Promise<boolean> {
        for (const suffix of RCS_CHANNEL_SUFFIXES) {
            const streamId = await this.#setupStream(`${this.#senderMac}-${suffix}`);

            if (streamId !== undefined) {
                this.#streamId = streamId;
                this.#context.logger.info('[play-queue]', `Remote control stream ${streamId} set up on channel ${suffix}.`);

                return true;
            }
        }

        return false;
    }

    /**
     * Queues the URL and starts playback.
     *
     * @param url - Media URL the receiver loads.
     * @param position - Start position in seconds.
     * @returns `false` when the receiver answered `insertPlayQueueItem` with 4xx or 5xx, so the caller can fall back to `/play`.
     * @throws PlaybackError when a later command fails or reports an `errorCode`.
     */
    async start(url: string, position: number): Promise<boolean> {
        const itemUUID = uuid().toUpperCase();
        this.#itemUUID = itemUUID;

        const insert = await this.#send({type: 'insertPlayQueueItem', item: buildItem(itemUUID, url, position)});

        if (insert.status >= 400) {
            this.#context.logger.warn('[play-queue]', `insertPlayQueueItem failed: ${insert.status}`);

            return false;
        }

        await this.#check('insertPlayQueueItem', insert);

        const commands: PlayQueueCommand[] = [
            {type: 'setProperty', property: 'isInterestedInDateRange', value: true, item: {uuid: itemUUID}},
            {type: 'setProperty', property: 'actionAtItemEnd', value: 1},
            {type: 'setRate', rate: 1}
        ];

        for (const command of commands) {
            await this.#check(String(command.type), await this.#send(command));
        }

        if (!this.#started && !this.#settled) {
            this.#startTimer = setTimeout(() => this.#fail(new PlaybackError('Playback did not start within 30 seconds.')), START_TIMEOUT);
        }

        return true;
    }

    /**
     * Handles a play queue command from the receiver. Bound to the event stream's `playQueue` event.
     *
     * @param command - The decoded `params.data` of the request.
     */
    handleEvent(command: PlayQueueCommand): void {
        if (this.#settled) {
            return;
        }

        if (command.kind === 'request' && command.type === 'unhandledURL') {
            void this.#answerUnhandledURL(command);
            return;
        }

        if (command.type === 'playbackState') {
            this.#onPlaybackState(command);
        } else if (command.type === 'notification') {
            this.#onNotification(command);
        }
    }

    /**
     * Resolves when playback ends and rejects with a {@link PlaybackError} when it fails.
     *
     * @param signal - Stops waiting early, without an error, when aborted.
     */
    async waitForEnd(signal?: AbortSignal): Promise<void> {
        if (!signal) {
            return await this.#end;
        }

        if (signal.aborted) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const onAbort = (): void => resolve();

            signal.addEventListener('abort', onAbort, {once: true});

            this.#end.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        });
    }

    /**
     * Ends the session: stops listening, aborts open fetches and resolves {@link waitForEnd}.
     */
    close(): void {
        this.#settle();
    }

    async #setupStream(channelID: string): Promise<number | undefined> {
        const response = await this.#controlStream.setup(`/${this.#controlStream.sessionId}`, {
            streams: [{
                type: 130,
                controlType: 1,
                channelID,
                clientUUID: uuid().toUpperCase(),
                clientTypeUUID: RCS_CLIENT_TYPE_UUID
            }]
        });

        if (response.status !== 200) {
            this.#context.logger.warn('[play-queue]', `SETUP of remote control stream ${channelID} failed: ${response.status}`);

            return undefined;
        }

        const plist = parsePlist(await response.arrayBuffer());
        const streamId = (plist?.streams as Array<Record<string, unknown>> | undefined)?.[0]?.streamID;

        if (typeof streamId !== 'number' && typeof streamId !== 'bigint') {
            this.#context.logger.warn('[play-queue]', `SETUP of remote control stream ${channelID} returned no streamID.`);

            return undefined;
        }

        return Number(streamId);
    }

    async #send(command: PlayQueueCommand): Promise<Response> {
        if (this.#streamId === undefined) {
            throw new PlaybackError('The remote control stream is not set up.');
        }

        return await this.#controlStream.command(this.#streamId, serializeCommand(command), this.#sessionUUID);
    }

    async #check(name: string, response: Response): Promise<void> {
        if (!response.ok) {
            throw new PlaybackError(`Play queue command ${name} failed: ${response.status}`);
        }

        const body = parsePlist(await response.arrayBuffer());
        const result = body ? decodeNestedCommand(body) ?? body : undefined;
        const errorCode = result?.errorCode;

        if (errorCode !== undefined && errorCode !== 0) {
            throw new PlaybackError(`Play queue command ${name} failed with errorCode ${String(errorCode)}.`);
        }
    }

    #onPlaybackState(command: PlayQueueCommand): void {
        const params = isRecord(command.params) ? command.params : {};
        const rawState = params.playbackState ?? command.name;

        if (typeof rawState !== 'string') {
            return;
        }

        const state = rawState.toLowerCase() as PlayQueueState;
        const reason = params.reason ?? command.reason;
        const position = this.lastInfo.position;

        this.#state = state;
        this.#context.logger.info('[play-queue]', `Playback state: ${state}${reason !== undefined ? ` (${String(reason)})` : ''}`);

        if (state === 'playing') {
            this.#started = true;
            clearTimeout(this.#startTimer);

            this.#playing = {
                position: toSeconds(params.position),
                duration: toSeconds(params.duration),
                rate: toSeconds(params.rate) ?? 1,
                receivedAt: Date.now()
            };

            return;
        }

        if (state === 'paused' && this.#playing) {
            this.#playing = {...this.#playing, position, receivedAt: Date.now()};
            return;
        }

        // pyatv #2948 only treats `stopped` as the end once playback started.
        if (state === 'stopped' && this.#started) {
            this.#settle();
        }
    }

    #onNotification(command: PlayQueueCommand): void {
        const name = command.name;

        this.#context.logger.debug('[play-queue]', `Notification: ${String(name)}`, command.params);

        if (name === 'itemPlayedToEnd') {
            this.#settle();
        } else if (name === 'itemFailedToPlayToEnd') {
            this.#fail(new PlaybackError(`The receiver failed to play the item: ${describe(command.params)}`));
        }
    }

    #onStreamClose(): void {
        if (this.#settled) {
            return;
        }

        if (this.#started) {
            this.#context.logger.info('[play-queue]', 'Stream closed, assuming playback ended.');
            this.#settle();
            return;
        }

        this.#fail(new PlaybackError('The connection closed before playback started.'));
    }

    async #answerUnhandledURL(command: PlayQueueCommand): Promise<void> {
        const request = isRecord(command.request) ? command.request : undefined;
        const url = request?.FCUP_Response_URL;
        const messageId = command.messageID;

        if (!request || typeof url !== 'string' || messageId === undefined) {
            this.#context.logger.warn('[play-queue]', 'Ignoring malformed unhandledURL request.', command);
            return;
        }

        const reply = async (status: number, headers: Record<string, string>, data: ArrayBuffer): Promise<void> => {
            const response = await this.#send({
                kind: 'response',
                messageID: messageId,
                type: 'unhandledURL',
                response: {
                    FCUP_Response_URL: url,
                    FCUP_Response_RequestID: request.FCUP_Response_RequestID ?? 0,
                    FCUP_Response_StatusCode: status,
                    FCUP_Response_Headers: headers,
                    FCUP_Response_Data: data
                }
            });

            if (!response.ok) {
                this.#context.logger.warn('[play-queue]', `Receiver rejected the unhandledURL response: ${response.status}`);
            }
        };

        try {
            this.#context.logger.info('[play-queue]', `Receiver asks us to fetch ${url}`);

            if (request.FCUP_Response_IsContentKeyRequest === true) {
                await reply(501, {}, new ArrayBuffer(0));
                this.#fail(new PlaybackError(`The receiver asked for a FairPlay content key (${url}); protected content is not supported.`));
                return;
            }

            if (!isHttpUrl(url)) {
                await reply(403, {}, new ArrayBuffer(0));
                this.#fail(new PlaybackError(`The receiver asked to fetch ${url}; only http and https URLs are fetched.`));
                return;
            }

            let result: FetchResult;

            try {
                result = await this.#fetch(url, requestHeaders(request.FCUP_Response_Headers));
            } catch (err) {
                if (this.#settled) {
                    return;
                }

                this.#context.logger.warn('[play-queue]', `Failed to fetch ${url} for the receiver.`, err);
                await reply(502, {}, new ArrayBuffer(0));
                this.#fail(new PlaybackError(`Could not fetch ${url} for the receiver: ${(err as Error).message}`));
                return;
            }

            if (this.#settled) {
                return;
            }

            this.#context.logger.info('[play-queue]', `Fetched ${url} for the receiver: ${result.status} (${result.data.byteLength} bytes)`);

            if (result.status >= 200 && result.status < 300 && !isPlaylist(result.data)) {
                this.#context.logger.warn('[play-queue]', `${url} is not an HLS playlist; the receiver will probably not play it.`);
            }

            await reply(result.status, result.headers, result.data);
        } catch (err) {
            // Runs detached from the event stream, so nobody else would see the error.
            this.#context.logger.error('[play-queue]', `Failed to answer the unhandledURL request for ${url}.`, err);
        }
    }

    async #fetch(url: string, headers: Record<string, string>): Promise<FetchResult> {
        await this.#acquireFetchSlot();

        try {
            const signal = AbortSignal.any([this.#fetchAbort.signal, AbortSignal.timeout(FCUP_FETCH_TIMEOUT)]);
            signal.throwIfAborted();

            const response = await fetch(url, {headers, redirect: 'follow', signal});
            const data = await this.#readBody(response);
            const replyHeaders: Record<string, string> = {};

            response.headers.forEach((value, key) => {
                if (!FCUP_SKIPPED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
                    replyHeaders[key] = value;
                }
            });

            replyHeaders['Content-Length'] = String(data.byteLength);

            return {status: response.status, headers: replyHeaders, data};
        } finally {
            this.#releaseFetchSlot();
        }
    }

    async #readBody(response: Response): Promise<ArrayBuffer> {
        const declaredLength = Number(response.headers.get('content-length') ?? 0);

        if (declaredLength > FCUP_MAX_RESPONSE_SIZE) {
            await response.body?.cancel();
            throw new PlaybackError(`Response too large (${declaredLength} bytes).`);
        }

        const reader = response.body?.getReader();

        if (!reader) {
            return new ArrayBuffer(0);
        }

        const chunks: Uint8Array[] = [];
        let length = 0;

        while (true) {
            const {done, value} = await reader.read();

            if (done) {
                break;
            }

            length += value.byteLength;
            this.#fetchedBytes += value.byteLength;

            if (length > FCUP_MAX_RESPONSE_SIZE || this.#fetchedBytes > FCUP_MAX_SESSION_SIZE) {
                await reader.cancel();
                throw new PlaybackError(length > FCUP_MAX_RESPONSE_SIZE ? `Response larger than ${FCUP_MAX_RESPONSE_SIZE} bytes.` : `Fetched more than ${FCUP_MAX_SESSION_SIZE} bytes in this session.`);
            }

            chunks.push(value);
        }

        const data = new Uint8Array(length);
        let offset = 0;

        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.byteLength;
        }

        return data.buffer;
    }

    async #acquireFetchSlot(): Promise<void> {
        if (this.#fetchesInFlight < FCUP_MAX_IN_FLIGHT) {
            this.#fetchesInFlight++;
            return;
        }

        await new Promise<void>((resolve) => this.#fetchWaiters.push(resolve));
    }

    #releaseFetchSlot(): void {
        const next = this.#fetchWaiters.shift();

        if (next) {
            next();
        } else {
            this.#fetchesInFlight--;
        }
    }

    #fail(error: PlaybackError): void {
        if (this.#settled) {
            return;
        }

        this.#context.logger.error('[play-queue]', error.message);
        this.#rejectEnd(error);
        this.#settle();
    }

    #settle(): void {
        if (this.#settled) {
            return;
        }

        this.#settled = true;
        clearTimeout(this.#startTimer);
        this.#resolveEnd();
        this.#fetchAbort.abort();

        // Waiters wake up, see the aborted signal and give up.
        for (const waiter of this.#fetchWaiters.splice(0)) {
            this.#fetchesInFlight++;
            waiter();
        }

        this.#eventStream.off('playQueue', this.#boundCommand);
        this.#eventStream.off('close', this.#boundClose);
        this.#controlStream.off('close', this.#boundClose);
        this.#context.logger.debug('[play-queue]', `Session for item ${this.#itemUUID ?? '?'} ended.`);
    }
}

/**
 * Decodes the binary plist in `params.data` of a `POST /command` body.
 *
 * @returns The inner command, or undefined when the body carries none.
 */
export function decodeNestedCommand(body: unknown): PlayQueueCommand | undefined {
    if (!isRecord(body) || !isRecord(body.params) || !isBinaryPlist(body.params.data)) {
        return undefined;
    }

    const command = parsePlist(body.params.data);

    return command ?? undefined;
}

/**
 * Picks the item's `mediaType`. On Apple TV `streaming` for HLS is unconfirmed; macOS sends it
 * and a live playlist stays in `loading` as `file` on third party receivers (pyatv #2941).
 */
function mediaTypeFor(url: string): 'file' | 'streaming' {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.m3u8') ? 'streaming' : 'file';
    } catch {
        return 'file';
    }
}

function buildItem(itemUUID: string, url: string, position: number): Record<string, unknown> {
    const mediaType = mediaTypeFor(url);
    const item: Record<string, unknown> = {
        uuid: itemUUID,
        'Content-Location': url,
        mediaType,
        'Start-Position': {flags: 1, value: Math.round(position * 1000), epoch: 0, timescale: 1000}
    };

    if (mediaType === 'streaming') {
        item.timeToPausePlayback = INVALID_TIME;
        item.timeToPauseBuffering = INVALID_TIME;
    }

    return item;
}

/**
 * Serializes a command to the binary plist that goes in `params.data`. With {@link RATE_AS_REAL}, a
 * whole `setRate` rate is written with a placeholder real whose bytes are then overwritten.
 */
function serializeCommand(command: PlayQueueCommand): ArrayBuffer {
    const rate = command.rate;

    if (!RATE_AS_REAL || command.type !== 'setRate' || typeof rate !== 'number' || !Number.isInteger(rate)) {
        return Plist.serialize(command as {}) as ArrayBuffer;
    }

    const placeholder = 0.25;
    const data = Plist.serialize({...command, rate: placeholder} as {}) as ArrayBuffer;
    const view = new DataView(data);

    for (let offset = 0; offset + 9 <= data.byteLength; offset++) {
        if (view.getUint8(offset) === 0x23 && view.getFloat64(offset + 1) === placeholder) {
            view.setFloat64(offset + 1, rate);

            return data;
        }
    }

    throw new PlaybackError('Could not encode the playback rate.');
}

function requestHeaders(headers: unknown): Record<string, string> {
    const result: Record<string, string> = {};

    if (!isRecord(headers)) {
        return result;
    }

    for (const [key, value] of Object.entries(headers)) {
        if (!FCUP_SKIPPED_REQUEST_HEADERS.includes(key.toLowerCase())) {
            result[key] = String(value);
        }
    }

    return result;
}

/** Reads a number or a CMTime dictionary (`value` / `timescale`) as seconds. */
function toSeconds(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return value;
    }

    if (isRecord(value) && typeof value.value === 'number' && typeof value.timescale === 'number' && value.timescale > 0) {
        return value.value / value.timescale;
    }

    return undefined;
}

function isHttpUrl(url: string): boolean {
    try {
        const protocol = new URL(url).protocol;

        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

function isPlaylist(data: ArrayBuffer): boolean {
    return Buffer.from(data, 0, Math.min(data.byteLength, 64)).toString('utf8').trimStart().startsWith('#EXTM3U');
}

function isBinaryPlist(data: unknown): data is ArrayBuffer {
    return data instanceof ArrayBuffer && data.byteLength >= 8 && Buffer.from(data, 0, 8).toString('latin1') === 'bplist00';
}

function parsePlist(data: ArrayBuffer): Record<string, unknown> | undefined {
    if (data.byteLength === 0) {
        return undefined;
    }

    try {
        const value = Plist.parse(data);

        return isRecord(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof ArrayBuffer);
}

function describe(value: unknown): string {
    try {
        return JSON.stringify(value) ?? 'unknown error';
    } catch {
        return String(value);
    }
}
