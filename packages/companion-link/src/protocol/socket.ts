import { randomInt } from 'node:crypto';
import { Socket } from 'node:net';
import { BaseSocket, debug, decodeOPack, decryptChacha20, encodeOPack, encryptChacha20, opackSizedInt } from '@basmilius/apple-common';

const HEADER_BYTES = 4;

export default class CompanionLinkSocket extends BaseSocket {
    get isEncrypted(): boolean {
        return !!this.#readKey && !!this.#writeKey;
    }

    readonly #socket: Socket;
    readonly #queue: Record<number, Function> = {};
    #buffer: Buffer = Buffer.alloc(0);
    #readCount: number;
    #readKey?: Buffer;
    #writeCount: number;
    #writeKey?: Buffer;
    #xid: number;

    constructor(address: string, port: number) {
        super(address, port);

        this.#xid = randomInt(0, 2 ** 16);

        this.onClose = this.onClose.bind(this);
        this.onConnect = this.onConnect.bind(this);
        this.onData = this.onData.bind(this);
        this.onEnd = this.onEnd.bind(this);
        this.onError = this.onError.bind(this);

        this.#socket = new Socket();
        this.#socket.on('close', this.onClose);
        this.#socket.on('connect', this.onConnect);
        this.#socket.on('data', this.onData);
        this.#socket.on('end', this.onEnd);
        this.#socket.on('error', this.onError);
    }

    async connect(): Promise<void> {
        debug(`Connecting to ${this.address}:${this.port}...`);

        return await new Promise(resolve => {
            this.#socket.connect({
                host: this.address,
                port: this.port,
                keepAlive: true
            }, resolve);
        });
    }

    async disconnect(): Promise<void> {
        this.#socket.destroy();
    }

    async enableEncryption(readKey: Buffer, writeKey: Buffer): Promise<void> {
        this.#readKey = readKey;
        this.#writeKey = writeKey;
        this.#readCount = 0;
        this.#writeCount = 0;
    }

    async exchange(type: number, obj: Record<string, unknown>): Promise<[number, unknown]> {
        const _x = this.#xid;

        return new Promise<[number, number]>((resolve, reject) => {
            if (PairFrameTypes.includes(type)) {
                this.#queue[-1] = resolve;
            } else {
                this.#queue[_x] = resolve;
            }

            this.send(type, obj).catch(reject);
        });
    }

    async send(type: number, obj: Record<string, unknown>): Promise<void> {
        const _x = this.#xid++;
        obj._x ??= opackSizedInt(_x, 8);

        let payload = Buffer.from(encodeOPack(obj));
        let payloadLength = payload.byteLength;

        if (this.isEncrypted && payloadLength > 0) {
            payloadLength += 16;
        }

        const header = Buffer.alloc(4);
        header.writeUint8(type, 0);
        header.writeUintBE(payloadLength, 1, 3);

        let data: Buffer;

        if (this.isEncrypted) {
            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#writeCount++), 0);

            const encrypted = encryptChacha20(this.#writeKey, nonce, header, payload);
            data = Buffer.concat([header, encrypted.ciphertext, encrypted.authTag]);
        } else {
            data = Buffer.concat([header, payload]);
        }

        debug('Send data frame', this.isEncrypted, Buffer.from(data).toString('hex'), obj);

        return new Promise((resolve, reject) => {
            this.#socket.write(data, err => err && reject(err));
            resolve();
        });
    }

    async onClose(): Promise<void> {
        debug(`Connection closed from ${this.address}:${this.port}`);
    }

    async onConnect(): Promise<void> {
        debug(`Connected to ${this.address}:${this.port}`);
    }

    async onData(buffer: Buffer): Promise<void> {
        // debug('Received data frame', buffer.toString('hex'));

        this.#buffer = Buffer.concat([this.#buffer, buffer]);

        while (this.#buffer.byteLength >= HEADER_BYTES) {
            const header = this.#buffer.subarray(0, HEADER_BYTES);
            const payloadLength = header.readUintBE(1, 3);
            const totalLength = HEADER_BYTES + payloadLength;

            if (this.#buffer.byteLength < totalLength) {
                debug(`Not enough data yet, waiting on the next frame.. needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${buffer.byteLength}`);
                return;
            }

            debug(`Frame found length=${totalLength} availableLength=${this.#buffer.byteLength} receivedLength=${buffer.byteLength}`);

            const frame = Buffer.from(this.#buffer.subarray(0, totalLength));
            this.#buffer = this.#buffer.subarray(totalLength);

            debug(`Handle frame, ${this.#buffer.byteLength} bytes left...`);

            const data = await this.#decrypt(frame);
            let payload = data.subarray(4, totalLength);

            await this.#handle(header, payload);
        }
    }

    async onEnd(): Promise<void> {
        debug('Connection ended');
    }

    async onError(err: Error): Promise<void> {
        debug('Error received', err);
    }

    async #decrypt(data: Buffer): Promise<Buffer> {
        if (!this.isEncrypted) {
            return data;
        }

        const header = data.subarray(0, 4);
        const payloadLength = header.readUintBE(1, 3);

        const payload = data.subarray(4, 4 + payloadLength);
        const authTag = payload.subarray(payload.byteLength - 16);
        const ciphertext = payload.subarray(0, payload.byteLength - 16);

        const nonce = Buffer.alloc(12);
        nonce.writeBigUint64LE(BigInt(this.#readCount++), 0);

        const decrypted = decryptChacha20(this.#readKey, nonce, header, ciphertext, authTag);

        return Buffer.concat([header, decrypted, authTag]);
    }

    async #handle(header: Buffer, payload: Buffer): Promise<void> {
        const type = header.readInt8();

        if (!OPackFrameTypes.includes(type)) {
            debug('Packet not handled, no opack frame.');
        }

        [payload] = decodeOPack(payload);

        debug('Decoded OPACK', {header, payload});

        if ('_x' in payload) {
            const _x = (payload as any)._x;

            if (_x in this.#queue) {
                const resolve = this.#queue[_x] ?? null;
                resolve?.([header, payload]);

                delete this.#queue[_x];
            } else if ('_i' in payload) {
                this.dispatchEvent(new CustomEvent(payload['_i'] as string, {detail: payload['_c']}));
            } else {
                // probably an event
                const content = payload['_c'];
                const keys = Object.keys(content).map(k => k.substring(0, -3));

                for (const key of keys) {
                    this.dispatchEvent(new CustomEvent(key, {detail: content[key]}));
                }
            }
        } else if (this.#queue[-1]) {
            const _x = -1;
            const resolve = this.#queue[_x] ?? null;
            resolve?.([header, payload]);

            delete this.#queue[_x];
        } else {
            debug('No handler for message', [header, payload]);
        }
    }
}

export const FrameType = {
    Unknown: 0,
    Noop: 1,

    PS_Start: 3,
    PS_Next: 4,
    PV_Start: 5,
    PV_Next: 6,

    U_OPACK: 7,
    E_OPACK: 8,
    P_OPACK: 9,

    PA_Request: 10,
    PA_Response: 11,

    SessionStartRequest: 16,
    SessionStartResponse: 17,
    SessionData: 18,

    FamilyIdentityRequest: 32,
    FamilyIdentityResponse: 33,
    FamilyIdentityUpdate: 34
} as const;

export const MessageType = {
    Event: 1,
    Request: 2,
    Response: 3
} as const;

export const OPackFrameTypes: number[] = [
    FrameType.PS_Start,
    FrameType.PS_Next,
    FrameType.PV_Start,
    FrameType.PV_Next,

    FrameType.U_OPACK,
    FrameType.E_OPACK,
    FrameType.P_OPACK
];

const PairFrameTypes: number[] = [
    FrameType.PS_Start,
    FrameType.PS_Next,
    FrameType.PV_Start,
    FrameType.PV_Next
];
