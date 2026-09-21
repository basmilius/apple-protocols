import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import { Logger } from '../../reporter';
import { generateClockIdentity } from './clockIdentity';
import {
    decodeMessage,
    DEFAULT_PRIORITY_1,
    encodeAnnounce,
    encodeDelayResp,
    encodeFollowUp,
    encodeSignalingStop,
    encodeSync,
    PtpMessageType
} from './messages';
import { ptpNow } from './timestamp';

/** Interval between Sync + FollowUp pairs (125 ms — logInterval -3). */
const SYNC_INTERVAL_MS = 125;

/** Interval between Announce messages (250 ms — macOS cadence). */
const ANNOUNCE_INTERVAL_MS = 250;

/** IANA-assigned event port for PTP (Sync, DelayReq). */
const EVENT_PORT = 319;

/** IANA-assigned general port for PTP (FollowUp, DelayResp, Announce, Signaling). */
const GENERAL_PORT = 320;

/**
 * High-level state of the PTP master.
 *
 * - `idle` — sockets not yet bound.
 * - `master` — acting as the grandmaster; Sync + Announce cadences running.
 * - `stopped` — yielded to a higher-priority peer (or explicitly torn down).
 */
export type PtpMasterState = 'idle' | 'master' | 'stopped';

/**
 * IEEE 1588 (PTPv2) grandmaster implementation for AirPlay 2 HomePods.
 *
 * HomePods with `SupportsPTP` (feature bit 41) expect the sender to act as
 * the PTP grandmaster. This class implements the sender side of that
 * contract: it binds the two standard PTP UDP ports, runs the Sync +
 * Announce cadences at the rates used by macOS, responds to DelayReq with
 * DelayResp, and — when a higher-priority peer advertises itself — yields
 * by sending a Signaling message with `logMessageInterval = 0x7E` before
 * stopping the cadence.
 *
 * This is a **stop-only yield**: after yielding we stop our PTP traffic but
 * keep using the local wall-clock for audio timestamps. We do not try to
 * implement a PTP slave — HomePods are tolerant of this as long as the
 * stream of Sync messages ceases.
 */
export class PtpMaster {
    /** UDP port bound for PTP event messages (319 or ephemeral fallback). */
    get eventPort(): number {
        return this.#eventPort;
    }

    /** UDP port bound for PTP general messages (320 or ephemeral fallback). */
    get generalPort(): number {
        return this.#generalPort;
    }

    /** Current state of the master. */
    get state(): PtpMasterState {
        return this.#state;
    }

    /** Our 8-byte EUI-64 clock identity advertised to peers. */
    get clockIdentity(): Buffer {
        return this.#clockIdentity;
    }

    /** Number of Sync messages successfully sent to the peer. */
    get syncsSent(): number {
        return this.#syncsSent;
    }

    /** Number of Announce messages successfully sent to the peer. */
    get announcesSent(): number {
        return this.#announcesSent;
    }

    /** Number of DelayReq messages received from any peer. */
    get delayReqsReceived(): number {
        return this.#delayReqsReceived;
    }

    /** Number of DelayResp messages successfully sent in reply. */
    get delayRespsSent(): number {
        return this.#delayRespsSent;
    }

    /** Number of Announce messages received from peers. */
    get announcesReceived(): number {
        return this.#announcesReceived;
    }

    readonly #logger: Logger;
    readonly #clockIdentity: Buffer;
    readonly #peerAddress: string;
    #eventSocket?: Socket;
    #generalSocket?: Socket;
    #eventPort: number = 0;
    #generalPort: number = 0;
    #syncSequenceId: number = 0;
    #announceSequenceId: number = 0;
    #signalingSequenceId: number = 0;
    #state: PtpMasterState = 'idle';
    #syncTimer?: NodeJS.Timeout;
    #announceTimer?: NodeJS.Timeout;
    #syncsSent: number = 0;
    #announcesSent: number = 0;
    #delayReqsReceived: number = 0;
    #delayRespsSent: number = 0;
    #announcesReceived: number = 0;

    /**
     * @param peerAddress - IPv4 address of the receiver we are the master for.
     *                      Used as the default destination for Sync, FollowUp and Announce.
     */
    constructor(peerAddress: string) {
        this.#logger = new Logger('ptp-master');
        this.#clockIdentity = generateClockIdentity();
        this.#peerAddress = peerAddress;

        this.onEventPacket = this.onEventPacket.bind(this);
        this.onGeneralPacket = this.onGeneralPacket.bind(this);
        this.onEventError = this.onEventError.bind(this);
        this.onGeneralError = this.onGeneralError.bind(this);
    }

    /**
     * Binds both PTP sockets and starts acting as the grandmaster.
     * Prefers the standard privileged ports 319/320; on `EACCES` it falls
     * back to ephemeral ports and logs a warning (HomePods may refuse to
     * pair with a non-standard port, but on Linux this fallback is the
     * difference between "runs as root" and "runs at all").
     *
     * @returns The bound event and general ports.
     */
    async start(): Promise<{ eventPort: number; generalPort: number }> {
        if (this.#state !== 'idle') {
            return {
                eventPort: this.#eventPort,
                generalPort: this.#generalPort
            };
        }

        this.#eventSocket = await this.#bindSocket(EVENT_PORT, 'event');
        this.#generalSocket = await this.#bindSocket(GENERAL_PORT, 'general');

        this.#eventPort = this.#eventSocket.address().port;
        this.#generalPort = this.#generalSocket.address().port;

        this.#eventSocket.on('message', this.onEventPacket);
        this.#eventSocket.on('error', this.onEventError);
        this.#generalSocket.on('message', this.onGeneralPacket);
        this.#generalSocket.on('error', this.onGeneralError);

        this.#state = 'master';
        this.#startMasterTimers();

        this.#logger.info(`Started on event=${this.#eventPort} general=${this.#generalPort} peer=${this.#peerAddress}`);

        return {
            eventPort: this.#eventPort,
            generalPort: this.#generalPort
        };
    }

    /**
     * Stops the cadence timers, closes both sockets, and marks the master as stopped.
     * Safe to call multiple times.
     */
    stop(): void {
        if (this.#syncTimer) {
            clearInterval(this.#syncTimer);
            this.#syncTimer = undefined;
        }

        if (this.#announceTimer) {
            clearInterval(this.#announceTimer);
            this.#announceTimer = undefined;
        }

        try {
            this.#eventSocket?.close();
        } catch {
            // Socket may already be closed.
        }

        try {
            this.#generalSocket?.close();
        } catch {
            // Socket may already be closed.
        }

        this.#eventSocket = undefined;
        this.#generalSocket = undefined;
        this.#state = 'stopped';
    }

    /**
     * Handles incoming PTP event-port packets.
     * Only DelayReq is meaningful on this port for a master role; we answer
     * with DelayResp carrying our receive timestamp.
     *
     * @param buf - The raw UDP packet.
     * @param info - Remote address information.
     */
    onEventPacket(buf: Buffer, info: RemoteInfo): void {
        const decoded = decodeMessage(buf);

        if (!decoded) {
            return;
        }

        if (decoded.type === PtpMessageType.DelayReq) {
            this.#delayReqsReceived++;
            const receiveTimestamp = ptpNow();
            const response = encodeDelayResp(
                decoded.header.sequenceId,
                this.#clockIdentity,
                receiveTimestamp,
                decoded.header.sourcePortIdentity
            );

            this.#generalSocket?.send(response, GENERAL_PORT, info.address, err => {
                if (err) {
                    this.#logger.warn(`DelayResp send failed to ${info.address}:${GENERAL_PORT}`, err);
                    return;
                }

                this.#delayRespsSent++;
            });
        }
    }

    /**
     * Handles incoming PTP general-port packets.
     * Only Announce is meaningful: if it advertises a peer with a strictly
     * better priority1 than ours, we yield and stop.
     *
     * @param buf - The raw UDP packet.
     * @param info - Remote address information.
     */
    onGeneralPacket(buf: Buffer, info: RemoteInfo): void {
        const decoded = decodeMessage(buf);

        if (!decoded) {
            return;
        }

        if (decoded.type !== PtpMessageType.Announce) {
            return;
        }

        this.#announcesReceived++;
        const peerPriority1 = decoded.body.grandmasterPriority1;

        if (peerPriority1 >= DEFAULT_PRIORITY_1) {
            return;
        }

        this.#logger.info(`Peer ${info.address} priority1=${peerPriority1} < ours=${DEFAULT_PRIORITY_1}, yielding master role`);

        this.#sendSignalingStop(decoded.header.sourcePortIdentity, info.address);
        this.stop();
    }

    /**
     * Logs event-socket errors. Errors are informational only — the socket
     * lifecycle is owned by {@link stop}.
     */
    onEventError(err: Error): void {
        this.#logger.warn('Event socket error', err);
    }

    /**
     * Logs general-socket errors. Errors are informational only — the socket
     * lifecycle is owned by {@link stop}.
     */
    onGeneralError(err: Error): void {
        this.#logger.warn('General socket error', err);
    }

    /**
     * Tries to bind `preferredPort`; on `EACCES` falls back to an ephemeral port.
     *
     * @param preferredPort - The port number we'd like (319 or 320).
     * @param label - Human-readable label used in log messages.
     * @returns A bound UDP socket.
     */
    #bindSocket(preferredPort: number, label: string): Promise<Socket> {
        return new Promise<Socket>((resolve, reject) => {
            const socket = createSocket('udp4');

            const cleanup = () => {
                socket.removeListener('error', onError);
                socket.removeListener('listening', onListening);
            };

            const onError = (err: NodeJS.ErrnoException) => {
                cleanup();

                if (err.code === 'EACCES') {
                    this.#logger.warn(`Privileged ${label} port ${preferredPort} not available, falling back to ephemeral port. Some HomePods may reject PTP on non-standard ports.`);
                    this.#bindEphemeral(label).then(resolve, reject);
                    return;
                }

                reject(err);
            };

            const onListening = () => {
                cleanup();
                resolve(socket);
            };

            socket.once('error', onError);
            socket.once('listening', onListening);
            socket.bind(preferredPort);
        });
    }

    /**
     * Binds a new UDP socket to an ephemeral port.
     *
     * @param label - Human-readable label for log messages.
     * @returns A bound UDP socket.
     */
    #bindEphemeral(label: string): Promise<Socket> {
        return new Promise<Socket>((resolve, reject) => {
            const socket = createSocket('udp4');

            const cleanup = () => {
                socket.removeListener('error', onError);
                socket.removeListener('listening', onListening);
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const onListening = () => {
                cleanup();
                this.#logger.warn(`Bound ${label} socket to ephemeral port ${socket.address().port}`);
                resolve(socket);
            };

            socket.once('error', onError);
            socket.once('listening', onListening);
            socket.bind(0);
        });
    }

    /**
     * Starts the two interval timers that drive master-role traffic.
     */
    #startMasterTimers(): void {
        this.#syncTimer = setInterval(() => this.#sendSyncAndFollowUp(), SYNC_INTERVAL_MS);
        this.#announceTimer = setInterval(() => this.#sendAnnounce(), ANNOUNCE_INTERVAL_MS);
    }

    /**
     * Emits a Sync (on the event port) and the matching FollowUp (on the
     * general port). Two-step PTP: the precise origin timestamp is taken at
     * Sync send time and carried in FollowUp.
     */
    #sendSyncAndFollowUp(): void {
        if (!this.#eventSocket || !this.#generalSocket) {
            return;
        }

        const sequenceId = this.#syncSequenceId = (this.#syncSequenceId + 1) & 0xFFFF;
        const sync = encodeSync(sequenceId, this.#clockIdentity);

        this.#eventSocket.send(sync, EVENT_PORT, this.#peerAddress, err => {
            if (err) {
                this.#logger.warn(`Sync send failed`, err);
                return;
            }

            this.#syncsSent++;
            const t1 = ptpNow();
            const followUp = encodeFollowUp(sequenceId, this.#clockIdentity, t1);

            this.#generalSocket?.send(followUp, GENERAL_PORT, this.#peerAddress, followUpErr => {
                if (!followUpErr) {
                    return;
                }

                this.#logger.warn(`FollowUp send failed`, followUpErr);
            });
        });
    }

    /**
     * Emits an Announce on the general port.
     */
    #sendAnnounce(): void {
        if (!this.#generalSocket) {
            return;
        }

        const sequenceId = this.#announceSequenceId = (this.#announceSequenceId + 1) & 0xFFFF;
        const announce = encodeAnnounce(sequenceId, this.#clockIdentity);

        this.#generalSocket.send(announce, GENERAL_PORT, this.#peerAddress, err => {
            if (err) {
                this.#logger.warn(`Announce send failed`, err);
                return;
            }

            this.#announcesSent++;
        });
    }

    /**
     * Sends a one-shot Signaling message asking the addressed peer to stop
     * sending Sync, Announce, and Pdelay. Used when we yield.
     *
     * @param targetPortIdentity - The 10-byte port identity of the peer to address.
     * @param address - Destination address (IPv4).
     */
    #sendSignalingStop(targetPortIdentity: Buffer, address: string): void {
        if (!this.#generalSocket) {
            return;
        }

        const sequenceId = this.#signalingSequenceId = (this.#signalingSequenceId + 1) & 0xFFFF;
        const signaling = encodeSignalingStop(sequenceId, this.#clockIdentity, targetPortIdentity);

        this.#generalSocket.send(signaling, GENERAL_PORT, address, err => {
            if (!err) {
                return;
            }

            this.#logger.warn(`Signaling stop send failed to ${address}`, err);
        });
    }
}
