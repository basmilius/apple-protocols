import { randomInt } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ConnectionClosedError, CredentialsError } from '@apple-protocols/core';
import type { AccessoryCredentials } from '@apple-protocols/core/pairing';
import { Context, DEFAULT_CLIENT_NAME } from '@apple-protocols/core/transport';
import { Accounts } from './accounts';
import { Apps } from './apps';
import { Channel, type EventListener } from './channel';
import { FrameType } from './frame';
import { Hid } from './hid';
import { Interests } from './interests';
import { Media } from './media';
import * as Messages from './messages';
import { verifyPairing } from './pairing';
import { Power } from './power';
import { CompanionLinkState, STATE_EVENTS } from './state';
import { Stream } from './stream';
import { System } from './system';
import { Text } from './text';
import { Touch } from './touch';
import type { CompanionLinkTarget, ConnectOptions, SessionCloseReason } from './types';

/** NoOp frames keep the connection alive; the device answers none of them. */
const HEARTBEAT_INTERVAL = 15000;

/**
 * The graceful stop and the socket close together. A slow but alive Apple TV can take up to 10 s to
 * answer `_sessionStop`; a half-open peer would otherwise hold the close for minutes.
 */
const CLOSE_TIMEOUT = 10000;

/** The state events the device only pushes after an `_interest` registration. */
const INTEREST_EVENTS: readonly string[] = ['_iMC', 'SystemStatus', 'TVSystemStatus', 'NowPlayingInfo', 'SupportedActions'];

/** The interests a graceful stop deregisters in one event, after each one on its own. */
const STOP_INTERESTS: string[] = ['_iMC', 'SystemStatus', 'TVSystemStatus'];

type EventMap = {
    closed: [reason: SessionCloseReason, error?: Error];
};

type SessionParts = {
    readonly target: CompanionLinkTarget;
    readonly context: Context;
    readonly stream: Stream;
    readonly state: CompanionLinkState;
    readonly signal?: AbortSignal;
};

/**
 * The device or the socket ended the connection after it opened and before the session was
 * ready, which a caller may want to treat like a session that dropped.
 */
export class SetupClosedError extends ConnectionClosedError {
    readonly reason: SessionCloseReason;

    constructor(reason: SessionCloseReason) {
        super(`The Companion Link connection closed during setup (${reason}).`);
        this.name = 'SetupClosedError';
        this.reason = reason;
    }
}

/** Package-internal: lets {@link connect} run the startup, which no caller of a session may repeat. */
let startup: (session: CompanionLinkSession, credentials: AccessoryCredentials, activeUserAccount?: string) => Promise<void>;

/**
 * Connects to a Companion Link device and returns a ready session. It runs TCP, pair-verify and
 * encryption, then the startup: `_systemInfo`, `_sessionStart`, `TVRCSessionStart`, optionally
 * `SwitchActiveUserAccountEvent`, `_touchStart` and `_tiStart` as requests, the heartbeat, one
 * `_interest` event per state event, and the attention state and media control status.
 *
 * @throws {CredentialsError} Without credentials.
 * @throws {PairingError} When pair-verify fails.
 * @throws {ConnectionClosedError} When the signal aborts or the device closes during the handshake.
 */
export async function connect(target: CompanionLinkTarget, options: ConnectOptions): Promise<CompanionLinkSession> {
    if (!options?.credentials) {
        throw new CredentialsError('Credentials are required to connect to a Companion Link device.');
    }

    const signal = options.signal;

    if (signal?.aborted) {
        throw new ConnectionClosedError('Companion Link setup was interrupted.');
    }

    const context = options.context ?? new Context(target.id ?? target.address, options.identity);
    const stream = new Stream(context, target.address, target.port);
    const interrupt = (): void => stream.destroy();

    // Errors on the stream fail the pending requests and do not end it; a close follows when they do.
    stream.on('error', (error: Error) => context.logger.error('Companion Link error', error));
    signal?.addEventListener('abort', interrupt, {once: true});

    let closedBy: SessionCloseReason | undefined;

    try {
        await stream.connect();

        stream.on('closed', reason => {
            closedBy = reason;
        });

        const keys = await verifyPairing(stream, context, options.credentials);

        if (signal?.aborted || !stream.isConnected) {
            throw new ConnectionClosedError('Companion Link setup was interrupted.');
        }

        stream.enableEncryption(keys.accessoryToControllerKey, keys.controllerToAccessoryKey);

        const session = new CompanionLinkSession({
            target,
            context,
            stream,
            state: options.state ?? new CompanionLinkState(),
            signal
        });

        await startup(session, options.credentials, options.activeUserAccount);

        return session;
    } catch (err) {
        stream.destroy();

        if (signal?.aborted) {
            throw new ConnectionClosedError('Companion Link setup was interrupted.');
        }

        throw closedBy && closedBy !== 'local' ? new SetupClosedError(closedBy) : err;
    } finally {
        signal?.removeEventListener('abort', interrupt);
    }
}

/**
 * One authenticated Companion Link connection, with its methods in groups. It lives once: it ends
 * exactly once, with a reason, and then its {@link signal} aborts and the heartbeat, listeners and
 * pending requests go with it. Requests on an ended session fail with {@link ConnectionClosedError}.
 */
export class CompanionLinkSession extends EventEmitter<EventMap> {
    static {
        startup = (session, credentials, activeUserAccount) => session.#start(credentials, activeUserAccount);
    }

    /** Why the session ended, or undefined while it is open. */
    get closeReason(): SessionCloseReason | undefined {
        return this.#closeReason;
    }

    get context(): Context {
        return this.#context;
    }

    get isOpen(): boolean {
        return !this.signal.aborted;
    }

    /** Aborts with a {@link ConnectionClosedError} when the session ends. */
    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    /** The source version the device reported in `_systemInfo`, such as `715.2`; `0` when it sent none. */
    get sourceVersion(): string {
        return this.#sourceVersion;
    }

    /** The encrypted OPack stream, for raw frames. */
    get stream(): Stream {
        return this.#stream;
    }

    /** Media control needs source version 250.3 or later. */
    get supportsMediaControl(): boolean {
        return compareVersions(this.#sourceVersion, '250.3') >= 0;
    }

    /** Siri push-to-talk needs source version 600.20 or later. */
    get supportsSiriPTT(): boolean {
        return compareVersions(this.#sourceVersion, '600.20') >= 0;
    }

    /** Remote text input needs source version 340.15 or later. */
    get supportsTextInput(): boolean {
        return compareVersions(this.#sourceVersion, '340.15') >= 0;
    }

    get target(): CompanionLinkTarget {
        return this.#target;
    }

    readonly accounts: Accounts;
    readonly apps: Apps;
    readonly hid: Hid;
    readonly interests: Interests;
    readonly media: Media;
    readonly power: Power;
    readonly state: CompanionLinkState;
    readonly system: System;
    readonly text: Text;
    readonly touch: Touch;

    readonly #channel: Channel;
    readonly #context: Context;
    readonly #controller: AbortController = new AbortController();
    readonly #stateListeners: [name: string, listener: EventListener][] = [];
    readonly #stream: Stream;
    readonly #target: CompanionLinkTarget;
    #closeReason?: SessionCloseReason;
    #closing?: Promise<void>;
    #heartbeat?: NodeJS.Timeout;
    #sessionId: bigint = 0n;
    #sessionIdLocal: number = 0;
    #sourceVersion: string = '0';

    /** Use {@link connect}; a session starts from a verified, encrypted stream. */
    constructor(parts: SessionParts) {
        super();

        this.#context = parts.context;
        this.#stream = parts.stream;
        this.#target = parts.target;
        this.state = parts.state;

        this.#channel = new Channel(this.#stream, this.signal);
        this.hid = new Hid(this.#channel);
        this.touch = new Touch(this.#channel, this.hid);
        this.text = new Text(this.#channel, this.state);
        this.power = new Power(this.#channel, this.hid, this.state);
        this.apps = new Apps(this.#channel);
        this.accounts = new Accounts(this.#channel);
        this.media = new Media(this.#channel, this.state);
        this.system = new System(this.#channel);
        this.interests = new Interests(this.#channel);

        this.#stream.on('closed', (reason, error) => this.#end(reason, error));

        if (!this.#stream.isConnected) {
            this.#end('remote');
        }

        parts.signal?.addEventListener('abort', () => this.#end('local'), {once: true, signal: this.signal});
    }

    /**
     * Ends the session gracefully: stops the heartbeat, deregisters the interests, stops text
     * input, touch, the remote control session and the service session (each failure ignored),
     * then closes the socket. Resolves once it is closed; a peer that does not finish within
     * {@link CLOSE_TIMEOUT} gets its socket destroyed.
     */
    close(): Promise<void> {
        this.#closing ??= this.#close();

        return this.#closing;
    }

    /** Sends a NoOp frame, which stays plaintext. */
    noOp(): void {
        this.#context.logger.debug('Sending no-op operation.');
        this.#stream.send(FrameType.NoOp, Buffer.allocUnsafe(0));
    }

    /** Throws when the session ended while a startup step was waiting. */
    #checkpoint(): void {
        if (this.signal.aborted) {
            throw new ConnectionClosedError('Companion Link setup was interrupted.');
        }
    }

    async #close(): Promise<void> {
        if (this.signal.aborted) {
            return;
        }

        this.#stopHeartbeat();
        this.#stopStateFeed();

        // Ending the session destroys the stream, which rejects the pending exchange and settles the disconnect.
        const deadline = setTimeout(() => {
            this.#context.logger.warn('[companion-link]', `Graceful stop did not finish within ${CLOSE_TIMEOUT} ms, destroying the socket.`);
            this.#end('local');
        }, CLOSE_TIMEOUT);

        try {
            await this.#gracefulStop();
        } catch (err) {
            this.#context.logger.warn('[companion-link]', 'Graceful stop failed during disconnect', err);
        }

        try {
            await this.#stream.disconnect();
        } catch (err) {
            this.#context.logger.warn('[companion-link]', 'Closing the socket failed during disconnect', err);
        } finally {
            clearTimeout(deadline);

            // Also when the socket close failed, so the session ends and its signal aborts.
            this.#end('local');
        }
    }

    /** The single exit: stops the heartbeat, aborts the signal (listeners clean up there), destroys the stream and emits `closed`. */
    #end(reason: SessionCloseReason, error?: Error): void {
        if (this.#closeReason) {
            return;
        }

        this.#closeReason = reason;
        this.#context.logger.net('[session]', `Companion Link session closed (${reason}${error ? `: ${error.message}` : ''}).`);

        this.#stopHeartbeat();
        this.#controller.abort(new ConnectionClosedError(`Companion Link session closed (${reason}).`));
        this.#stream.destroy();

        this.emit('closed', reason, error);
    }

    /** Feeds the state from here on and registers interest in its events, one `_interest` event each. */
    #feedState(): void {
        for (const name of STATE_EVENTS) {
            const listener: EventListener = content => {
                try {
                    this.state.apply(name, content);
                } catch (err) {
                    this.#context.logger.error('[cl-state]', `${name} parse error`, err);
                }
            };

            this.#channel.listen(name, listener);
            this.#stateListeners.push([name, listener]);
        }

        for (const event of INTEREST_EVENTS) {
            try {
                this.interests.register([event]);
            } catch (err) {
                this.#context.logger.warn('[cl-state]', `Failed to register interest for ${event}`, err);
            }
        }
    }

    /** Each step stops early once the socket is gone. */
    async #gracefulStop(): Promise<void> {
        if (!this.#stream.isConnected) {
            return;
        }

        this.interests.deregister(STOP_INTERESTS);

        try {
            await this.text.stop();
        } catch {
        }

        if (!this.#stream.isConnected) {
            return;
        }

        try {
            await this.#channel.exchange(Messages.touchStop());
        } catch {
        }

        if (!this.#stream.isConnected) {
            return;
        }

        try {
            await this.#channel.exchange(Messages.tvrcSessionStop());
        } catch {
        }

        if (!this.#stream.isConnected) {
            return;
        }

        try {
            await this.#sessionStop();
        } catch {
        }
    }

    async #sessionStop(): Promise<void> {
        if (this.#sessionId === 0n) {
            return;
        }

        await this.#channel.exchange(Messages.sessionStop(this.#sessionIdLocal));
        this.#sessionId = 0n;
        this.#sessionIdLocal = 0;
    }

    async #start(credentials: AccessoryCredentials, activeUserAccount?: string): Promise<void> {
        const channel = this.#channel;

        const systemInfo = await channel.exchange(Messages.systemInfo(credentials.pairingId, this.#context.identity.name ?? DEFAULT_CLIENT_NAME));
        this.#checkpoint();

        const sourceVersion = systemInfo?._c?._sv;

        if (sourceVersion) {
            this.#sourceVersion = String(sourceVersion);
            this.#context.logger.info('[companion-link]', `Receiver sourceVersion: ${sourceVersion} (mediaControl=${this.supportsMediaControl}, textInput=${this.supportsTextInput}, siriPTT=${this.supportsSiriPTT})`);
        }

        const localSid = randomInt(0, 2 ** 32 - 1);
        const sessionStart = await channel.exchange(Messages.sessionStart(localSid));
        this.#checkpoint();

        this.#sessionIdLocal = localSid;
        this.#sessionId = (BigInt(Number(sessionStart?._c?._sid ?? 0)) << 32n) | BigInt(localSid);

        await channel.exchange(Messages.tvrcSessionStart());
        this.#checkpoint();

        if (activeUserAccount) {
            await this.accounts.switchActive(activeUserAccount);
            this.#checkpoint();
        }

        await channel.exchange(Messages.touchStart());
        this.#checkpoint();

        await this.text.start();
        this.#checkpoint();

        this.#startHeartbeat();
        this.#feedState();

        // The reply counts as a report, so every new session tells its consumers the attention state once.
        try {
            const attention = await channel.exchange(Messages.fetchAttentionState());
            this.state.apply('FetchAttentionState', attention._c);
        } catch (err) {
            this.#context.logger.warn('[cl-state]', 'Failed to fetch initial attention state', err);
        }

        try {
            await this.media.fetchControlStatus();
        } catch (err) {
            this.#context.logger.warn('[cl-state]', 'Failed to fetch media control status', err);
        }

        this.#checkpoint();
    }

    #startHeartbeat(): void {
        this.#heartbeat = setInterval(() => {
            try {
                this.noOp();
            } catch (err) {
                this.#context.logger.error('Heartbeat failed', err);
            }
        }, HEARTBEAT_INTERVAL);
    }

    #stopHeartbeat(): void {
        clearInterval(this.#heartbeat);
        this.#heartbeat = undefined;
    }

    /** Stops feeding the state and deregisters each of its interests on its own. */
    #stopStateFeed(): void {
        if (this.#stateListeners.length === 0) {
            return;
        }

        for (const [name, listener] of this.#stateListeners.splice(0)) {
            this.#channel.unlisten(name, listener);
        }

        try {
            for (const event of INTEREST_EVENTS) {
                this.interests.deregister([event]);
            }
        } catch {
        }
    }
}

/** Compares dot-separated versions segment by segment; negative when `a` is lower. */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i++) {
        const segmentA = partsA[i] ?? 0;
        const segmentB = partsB[i] ?? 0;

        if (segmentA !== segmentB) {
            return segmentA - segmentB;
        }
    }

    return 0;
}
