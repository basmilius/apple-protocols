import { createSocket, RemoteInfo, Socket } from 'node:dgram';
import { NTP } from '@basmilius/apple-encoding';
import { Logger } from './reporter';

export class TimingServer {
    get port(): number {
        return this.#port;
    }

    readonly #logger: Logger;
    readonly #socket: Socket;
    #port: number = 0;

    constructor() {
        this.#logger = new Logger('timing-server');
        this.#socket = createSocket('udp4');
        this.#socket.on('error', err => this.#onError(err));
        this.#socket.on('message', (data, info) => this.#onMessage(data, info));
    }

    async close(): Promise<void> {
        this.#socket.close();
        this.#port = 0;
    }

    async listen(): Promise<void> {
        return new Promise<void>(resolve => {
            this.#socket.once('listening', () => this.#onListening());
            this.#socket.bind(0, resolve);
        });
    }

    async #onError(err: Error): Promise<void> {
        this.#logger.error('Timing server error', err);
    }

    async #onListening(): Promise<void> {
        const {port} = this.#socket.address();
        this.#port = port;
    }

    async #onMessage(data: Buffer, info: RemoteInfo): Promise<void> {
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

            this.#socket.send(response, info.port, info.address);
        } catch (err) {
            this.#logger.warn(`Timing server received malformed packet (${data.length} bytes) from ${info.address}:${info.port}`, err);
        }
    }
}
