import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import { Logger } from '@corewire/core';
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

/** Interval between Sync and FollowUp pairs, logInterval -3. */
const SYNC_INTERVAL_MS = 125;

/** Interval between Announce messages, the macOS cadence. */
const ANNOUNCE_INTERVAL_MS = 250;

/** IANA event port for PTP (Sync, DelayReq). */
const EVENT_PORT = 319;

/** IANA general port for PTP (FollowUp, DelayResp, Announce, Signaling). */
const GENERAL_PORT = 320;

/**
 * State of the PTP master.
 *
 * - `idle`: the sockets are not bound yet.
 * - `master`: grandmaster, with the Sync and Announce cadences running.
 * - `stopped`: yielded to a peer with a higher priority, or stopped.
 */
export type PtpMasterState = 'idle' | 'master' | 'stopped';

/**
 * IEEE 1588 (PTPv2) grandmaster for AirPlay 2 HomePods.
 *
 * A HomePod with `SupportsPTP` (feature bit 41) expects the sender to be the
 * PTP grandmaster. The master binds the two PTP UDP ports, sends Sync and
 * Announce at the macOS rates and answers DelayReq with DelayResp. When a peer
 * with a higher priority announces itself, it sends a Signaling message with
 * `logMessageInterval = 0x7E` and stops.
 *
 * After that yield, audio timestamps keep using the local wall clock; there
 * is no PTP slave. HomePods accept this as long as the Sync messages stop.
 */
export class PtpMaster {
    /** UDP port for PTP event messages: 319, or an ephemeral port as fallback. */
    get eventPort(): number {
        return this.#eventPort;
    }

    /** UDP port for PTP general messages: 320, or an ephemeral port as fallback. */
    get generalPort(): number {
        return this.#generalPort;
    }

    get state(): PtpMasterState {
        return this.#state;
    }

    /** Our 8-byte EUI-64 clock identity, as advertised to peers. */
    get clockIdentity(): Buffer {
        return this.#clockIdentity;
    }

    /** Number of Sync messages sent to the peer. */
    get syncsSent(): number {
        return this.#syncsSent;
    }

    /** Number of Announce messages sent to the peer. */
    get announcesSent(): number {
        return this.#announcesSent;
    }

    /** Number of DelayReq messages received from any peer. */
    get delayReqsReceived(): number {
        return this.#delayReqsReceived;
    }

    /** Number of DelayResp messages sent in reply. */
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
     * @param peerAddress - IPv4 address of the receiver, the destination of Sync, FollowUp and Announce.
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
     * Binds both PTP sockets and starts acting as the grandmaster. It prefers
     * the privileged ports 319 and 320 and falls back to ephemeral ports on
     * `EACCES`, so it runs on Linux without root. Some HomePods reject PTP on
     * non-standard ports.
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
     * Stops the cadence timers and closes both sockets. Safe to call more than once.
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
     * Answers a DelayReq on the event port with a DelayResp that carries our
     * receive timestamp. A master ignores the other event messages.
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
     * Handles an Announce on the general port. When the peer has a strictly
     * better priority1 than ours, the master yields and stops.
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

    /** Logs the error only; {@link stop} owns the socket lifecycle. */
    onEventError(err: Error): void {
        this.#logger.warn('Event socket error', err);
    }

    /** Logs the error only; {@link stop} owns the socket lifecycle. */
    onGeneralError(err: Error): void {
        this.#logger.warn('General socket error', err);
    }

    /**
     * Binds `preferredPort` (319 or 320) and falls back to an ephemeral port on `EACCES`.
     *
     * @param label - Names the socket in log messages.
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
     * @param label - Names the socket in log messages.
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

    #startMasterTimers(): void {
        this.#syncTimer = setInterval(() => this.#sendSyncAndFollowUp(), SYNC_INTERVAL_MS);
        this.#announceTimer = setInterval(() => this.#sendAnnounce(), ANNOUNCE_INTERVAL_MS);
    }

    /**
     * Sends a Sync on the event port and the matching FollowUp on the general
     * port. In two-step PTP, the FollowUp carries the time the Sync went out.
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
     * Sends one Signaling message that asks the peer to stop its Sync,
     * Announce and Pdelay messages, when we yield.
     *
     * @param targetPortIdentity - The 10-byte port identity of the peer.
     * @param address - IPv4 destination address.
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
