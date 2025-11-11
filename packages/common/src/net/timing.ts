import { createSocket, RemoteInfo, Socket } from 'node:dgram';
import { debug } from '../cli';
import { decode, encode, now, toParts } from '../ntp';

export default class {
    get port(): number {
        return this.#port;
    }

    readonly #socket: Socket;
    #port: number = 0;

    constructor() {
        this.#socket = createSocket('udp4');
        this.#socket.on('error', err => this.#onError(err));
        this.#socket.on('message', (data, info) => this.#onMessage(data, info));
    }

    async close(): Promise<void> {
        this.#socket.close();
        this.#port = 0;
    }

    async listen(): Promise<void> {
        this.#socket.once('listening', () => this.#onListening());
        this.#socket.bind(0);
    }

    async #onError(err: Error): Promise<void> {
        console.error('Timing server error', err);
    }

    async #onListening(): Promise<void> {
        const a = this.#socket.address();

        if (typeof a === 'object') {
            this.#port = a.port;
        } else {
            throw new Error('Unexpected address type.');
        }
    }

    async #onMessage(data: Buffer, info: RemoteInfo): Promise<void> {
        const request = decode(data);
        const ntp = now();
        const [receivedSeconds, receivedFraction] = toParts(ntp);

        debug(`Timing server ntp=${ntp} receivedSeconds=${receivedSeconds} receivedFraction=${receivedFraction}`);

        const response = encode({
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
    }
}
