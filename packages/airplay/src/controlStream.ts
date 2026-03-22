import { type Context, EncryptionState, generateActiveRemoteId, generateDacpId, generateSessionId, HTTP_TIMEOUT } from '@basmilius/apple-common';
import { RtspClient } from '@basmilius/apple-rtsp';
import { chacha20Decrypt, chacha20Encrypt } from './encryption';

export default class ControlStream extends RtspClient {
    get activeRemoteId(): string {
        return this.#activeRemoteId;
    }

    get dacpId(): string {
        return this.#dacpId;
    }

    get sessionId(): string {
        return this.#sessionId;
    }

    get isEncrypted(): boolean {
        return !!this.#encryptionState;
    }

    readonly #activeRemoteId: string;
    readonly #dacpId: string;
    readonly #sessionId: string;
    #encryptionState?: EncryptionState;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#activeRemoteId = generateActiveRemoteId();
        this.#dacpId = generateDacpId();
        this.#sessionId = generateSessionId();
    }

    enableEncryption(readKey: Buffer, writeKey: Buffer): void {
        this.#encryptionState = new EncryptionState(readKey, writeKey);
    }

    protected override getDefaultHeaders(): Record<string, string | number> {
        return {
            'Active-Remote': this.#activeRemoteId,
            'Client-Instance': this.#dacpId,
            'DACP-ID': this.#dacpId,
            'User-Agent': 'AirPlay/320.20',
            'X-Apple-ProtocolVersion': 1,
            'X-Apple-Session-ID': this.#sessionId,
            'X-ProtocolVersion': 1
        };
    }

    protected override transformIncoming(data: Buffer): Buffer | false {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20Decrypt(this.#encryptionState, data);
    }

    protected override transformOutgoing(data: Buffer): Buffer {
        if (!this.#encryptionState) {
            return data;
        }

        return chacha20Encrypt(this.#encryptionState, data);
    }

    async flush(uri: string, headers: Record<string, string>): Promise<Response> {
        return await this.exchange('FLUSH', uri, {headers, allowError: true});
    }

    async get(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('GET', path, {headers, timeout, allowError: true});
    }

    async post(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('POST', path, {headers, body, timeout, allowError: true});
    }

    async put(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('PUT', path, {headers, body, timeout, allowError: true});
    }

    async record(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('RECORD', path, {headers, timeout, allowError: true});
    }

    async setup(path: string, body?: Buffer | string | Record<string, unknown>, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('SETUP', path, {headers, body, timeout, allowError: true});
    }

    async setParameter(parameter: string, value: string): Promise<Response> {
        return await this.exchange('SET_PARAMETER', `/${this.sessionId}`, {
            contentType: 'text/parameters',
            body: `${parameter}: ${value}\r\n`,
            allowError: true
        });
    }

    async teardown(path: string, headers: Record<string, string> = {}, timeout: number = HTTP_TIMEOUT): Promise<Response> {
        return await this.exchange('TEARDOWN', path, {headers, timeout, allowError: true});
    }
}
