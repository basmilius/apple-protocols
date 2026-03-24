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

        this.onConnect = this.onConnect.bind(this);
        this.onError = this.onError.bind(this);
        this.onMessage = this.onMessage.bind(this);

        this.#socket.on('connect', this.onConnect);
        this.#socket.on('error', this.onError);
        this.#socket.on('message', this.onMessage);
    }

    close(): void {
        this.#socket.close();
        this.#port = 0;
    }

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

    onConnect(): void {
        this.#socket.setRecvBufferSize(16384);
        this.#socket.setSendBufferSize(16384);
    }

    onError(err: Error): void {
        this.#logger.error('Timing server error', err);
    }

    #onListening(): void {
        const {port} = this.#socket.address();
        this.#port = port;
    }

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
