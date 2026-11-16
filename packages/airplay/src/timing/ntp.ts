import { createSocket, RemoteInfo, Socket } from 'node:dgram';
import { Logger } from '@apple-protocols/core';
import { NTP } from '@apple-protocols/core/encoding';

/**
 * NTP timing server for AirPlay audio synchronization.
 *
 * During audio streaming, Apple devices send NTP timing requests to sync their
 * clock with the controller. The server answers with the current wall-clock
 * time, from which the device derives the playback offset for multiroom audio.
 * It uses `Date.now()`, not the monotonic `process.hrtime`, because NTP
 * timestamps are anchored to the Unix epoch.
 */
export class TimingServer {
    /** The UDP port the timing server is listening on, or 0 if not yet bound. */
    get port(): number {
        return this.#port;
    }

    readonly #logger: Logger;
    readonly #socket: Socket;
    #port: number = 0;

    /** @param options.logger - Receives the errors of the server; a `timing-server` logger when omitted. */
    constructor(options: {readonly logger?: Logger} = {}) {
        this.#logger = options.logger ?? new Logger('timing-server');
        this.#socket = createSocket('udp4');

        this.onError = this.onError.bind(this);
        this.onMessage = this.onMessage.bind(this);

        this.#socket.on('error', this.onError);
        this.#socket.on('message', this.onMessage);
    }

    /** Closes the UDP socket and resets the port. */
    close(): void {
        try {
            this.#socket.close();
        } catch {
            // Socket may not be bound yet.
        }

        this.#port = 0;
    }

    /**
     * Binds the UDP socket to a random free port and starts answering NTP
     * timing requests. Rejects when the socket fails to bind.
     */
    listen(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const onError = (err: Error) => {
                this.#socket.removeListener('listening', onListening);
                reject(err);
            };

            const onListening = () => {
                this.#socket.removeListener('error', onError);
                this.#onListening();
                resolve();
            };

            this.#socket.once('error', onError);
            this.#socket.once('listening', onListening);
            this.#socket.bind(0);
        });
    }

    onError(err: Error): void {
        this.#logger.error('Timing server error', err);
    }

    #onListening(): void {
        const {port} = this.#socket.address();
        this.#port = port;
    }

    /**
     * Answers an NTP timing request. The reference timestamp echoes the send
     * time of the request; receive and send time are both now.
     */
    onMessage(data: Buffer, info: RemoteInfo): void {
        try {
            const request = NTP.decode(data);
            const ntp = NTP.now();
            const [receivedSeconds, receivedFraction] = NTP.parts(ntp);

            this.#logger.info(`Timing server ntp=${ntp} receivedSeconds=${receivedSeconds} receivedFraction=${receivedFraction}`);

            const response = NTP.encode({
                proto: request.proto,
                type: 0x53 | 0x80,
                seqno: request.seqno,
                padding: 0,
                reftime_sec: request.sendtime_sec,
                reftime_frac: request.sendtime_frac,
                recvtime_sec: receivedSeconds,
                recvtime_frac: receivedFraction,
                sendtime_sec: receivedSeconds,
                sendtime_frac: receivedFraction
            });

            this.#socket.send(response, info.port, info.address, err => {
                if (!err) {
                    return;
                }

                this.#logger.warn(`Timing server failed to send response to ${info.address}:${info.port}`, err);
            });
        } catch (err) {
            this.#logger.warn(`Timing server received malformed packet (${data.length} bytes) from ${info.address}:${info.port}`, err);
        }
    }
}
