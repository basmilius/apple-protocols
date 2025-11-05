import { debug, decryptChacha20, encryptChacha20, hkdf, parseBinaryPlist, serializeBinaryPlist } from '@basmilius/apple-common';
import { fromBinary, getExtension, toBinary } from '@bufbuild/protobuf';
import * as Proto from '../proto';
import { randomInt32 } from './utils';
import AirPlayDataStreamMessages from './dataStreamMessages';
import AirPlayStream from './stream';

const DATA_HEADER_LENGTH = 32; // 4 + 12 + 4 + 8 + 4

type EventMap = {
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly originClientProperties: [Proto.OriginClientPropertiesMessage];
    readonly playerClientProperties: [Proto.PlayerClientPropertiesMessage];
    readonly sendCommandResult: [Proto.SendCommandResultMessage];
    readonly setArtwork: [Proto.SetArtworkMessage];
    readonly setDefaultSupportedCommands: [Proto.SetDefaultSupportedCommandsMessage];
    readonly nowPlayingClient: [Proto.SetNowPlayingClientMessage];
    readonly nowPlayingPlayer: [Proto.SetNowPlayingPlayerMessage];
    readonly setState: [Proto.SetStateMessage];
    readonly updateClient: [Proto.UpdateClientMessage];
    readonly updateContentItem: [Proto.UpdateContentItemMessage];
    readonly updateContentItemArtwork: [Proto.UpdateContentItemArtworkMessage];
    readonly updatePlayer: [Proto.UpdatePlayerMessage];
    readonly updateOutputDevice: [Proto.UpdateOutputDeviceMessage];
    readonly volumeControlAvailability: [Proto.VolumeControlAvailabilityMessage];
    readonly volumeControlCapabilitiesDidChange: [Proto.VolumeControlCapabilitiesDidChangeMessage];
    readonly volumeDidChange: [Proto.VolumeDidChangeMessage];
};

export default class AirPlayDataStream extends AirPlayStream<EventMap> {
    get messages(): AirPlayDataStreamMessages {
        return this.#messages;
    }

    readonly #messages: AirPlayDataStreamMessages;
    #buffer: Buffer = Buffer.alloc(0);
    #seqno: bigint;
    #readCount: number;
    #writeCount: number;
    #handler?: [Function, Function];

    constructor(address: string, port: number) {
        super(address, port);

        this.#messages = new AirPlayDataStreamMessages();
        this.#seqno = 0x100000000n + BigInt(randomInt32());
        this.#writeCount = 0;
    }

    async exchange(message: Proto.ProtocolMessage): Promise<Proto.ProtocolMessage> {
        return new Promise(async (resolve, reject) => {
            this.#handler = [resolve, reject];
            await this.send(message);
        });
    }

    async reply(seqno: bigint): Promise<void> {
        const rply = buildReply(seqno);

        debug('Sending reply.');
        this.socket.write(await this.#encrypt(rply));
    }

    async send(message: Proto.ProtocolMessage): Promise<void> {
        const bytes = toBinary(Proto.ProtocolMessageSchema, message, {writeUnknownFields: true});
        const lenPrefix = Buffer.from(encodeVarint(bytes.length));
        const pbPayload = Buffer.concat([lenPrefix, Buffer.from(bytes)]);

        const plistPayload = Buffer.from(
            serializeBinaryPlist({
                params: {
                    data: pbPayload.buffer.slice(pbPayload.byteOffset, pbPayload.byteOffset + pbPayload.byteLength)
                }
            } as any)
        );

        const header = buildHeader(DATA_HEADER_LENGTH + plistPayload.byteLength, this.#seqno++);
        const frame = Buffer.concat([header, plistPayload]);
        const encrypted = await this.#encrypt(frame);

        debug('Sending data stream message', message);

        this.socket.write(encrypted);
    }

    async setup(sharedSecret: Buffer, seed: bigint): Promise<void> {
        const readKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from(`DataStream-Salt${seed}`),
            info: Buffer.from('DataStream-Input-Encryption-Key')
        });

        const writeKey = hkdf({
            hash: 'sha512',
            key: sharedSecret,
            length: 32,
            salt: Buffer.from(`DataStream-Salt${seed}`),
            info: Buffer.from('DataStream-Output-Encryption-Key')
        });

        await this.enableEncryption(readKey, writeKey);
    }

    async onData(buffer: Buffer): Promise<void> {
        try {
            this.#buffer = Buffer.concat([this.#buffer, buffer]);
            this.#buffer = await this.#decrypt(this.#buffer);

            while (this.#buffer.byteLength > DATA_HEADER_LENGTH) {
                const header = this.#buffer.subarray(0, DATA_HEADER_LENGTH);
                const totalLength = header.readUint32BE();

                if (this.#buffer.byteLength < totalLength) {
                    debug(`Not enough data yet, waiting on the next frame.. needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${buffer.byteLength}`);
                    return;
                }

                const frame = this.#buffer.subarray(DATA_HEADER_LENGTH, totalLength);
                const plist = parseBinaryPlist(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as any) as any;
                const command = header.toString('ascii', 4, 8);

                debug('Raw data received', header.toString());
                debug(`Should read ${totalLength} bytes, ${this.#buffer.byteLength} available.`);

                this.#buffer = this.#buffer.subarray(totalLength);

                if (!plist || !plist.params || !plist.params.data) {
                    if (command === 'rply') {
                        debug('Got reply...');
                    }

                    if (command === 'sync') {
                        await this.reply(parseHeaderSeqno(header));
                    }

                    if (this.#handler) {
                        const [resolve] = this.#handler;
                        this.#handler = undefined;

                        resolve();
                    }

                    continue;
                }

                const content = Buffer.from(plist.params.data);

                for (const message of await parseMessages(content)) {
                    await this.#handleMessage(message);
                }

                if (command === 'sync') {
                    await this.reply(parseHeaderSeqno(header));
                }
            }
        } catch (err) {
            debug('Error in onData', err);
        }
    }

    async #onDeviceInfoMessage(message: Proto.DeviceInfoMessage): Promise<void> {
        debug('Connected to device', message.name);

        this.emit('deviceInfo', message);
    }

    async #onOriginClientPropertiesMessage(message: Proto.OriginClientPropertiesMessage): Promise<void> {
        debug('Origin client update properties', message);

        this.emit('originClientProperties', message);
    }

    async #onPlayerClientPropertiesMessage(message: Proto.PlayerClientPropertiesMessage): Promise<void> {
        debug('Player client properties', message);

        this.emit('playerClientProperties', message);
    }

    async #onSendCommandResultMessage(message: Proto.SendCommandResultMessage): Promise<void> {
        debug('Send command result', message);

        this.emit('sendCommandResult', message);
    }

    async #onSetArtworkMessage(message: Proto.SetArtworkMessage): Promise<void> {
        debug('Set artwork', message);

        this.emit('setArtwork', message);
    }

    async #onSetDefaultSupportedCommandsMessage(message: Proto.SetDefaultSupportedCommandsMessage): Promise<void> {
        debug('Set default supported commands', message);

        this.emit('setDefaultSupportedCommands', message);
    }

    async #onSetNowPlayingClientMessage(message: Proto.SetNowPlayingClientMessage): Promise<void> {
        debug('Set now playing client', message);

        this.emit('nowPlayingClient', message);
    }

    async #onSetNowPlayingPlayerMessage(message: Proto.SetNowPlayingPlayerMessage): Promise<void> {
        debug('Set now playing player', message);

        this.emit('nowPlayingPlayer', message);
    }

    async #onSetStateMessage(message: Proto.SetStateMessage): Promise<void> {
        debug('Set state', message);

        this.emit('setState', message);
    }

    async #onUpdateClientMessage(message: Proto.UpdateClientMessage): Promise<void> {
        debug('Update client', message);

        this.emit('updateClient', message);
    }

    async #onUpdateContentItemMessage(message: Proto.UpdateContentItemMessage): Promise<void> {
        debug('Update content item', message);

        this.emit('updateContentItem', message);
    }

    async #onUpdateContentItemArtworkMessage(message: Proto.UpdateContentItemArtworkMessage): Promise<void> {
        debug('Update content artwork', message);

        this.emit('updateContentItemArtwork', message);
    }

    async #onUpdatePlayerMessage(message: Proto.UpdatePlayerMessage): Promise<void> {
        debug('Update player', message);

        this.emit('updatePlayer', message);
    }

    async #onUpdateOutputDeviceMessage(message: Proto.UpdateOutputDeviceMessage): Promise<void> {
        debug('Update output device', message);

        this.emit('updateOutputDevice', message);
    }

    async #onVolumeControlAvailabilityMessage(message: Proto.VolumeControlAvailabilityMessage): Promise<void> {
        debug('Volume control availability', message);

        this.emit('volumeControlAvailability', message);
    }

    async #onVolumeControlCapabilitiesDidChangeMessage(message: Proto.VolumeControlCapabilitiesDidChangeMessage): Promise<void> {
        debug('Volume control capabilities did change', message);

        this.emit('volumeControlCapabilitiesDidChange', message);
    }

    async #onVolumeDidChangeMessage(message: Proto.VolumeDidChangeMessage): Promise<void> {
        debug('VolumeDidChange message', message);

        this.emit('volumeDidChange', message);
    }

    async #decrypt(data: Buffer): Promise<Buffer> {
        const result: Buffer[] = [];
        let offset = 0;
        let readCount = this.#readCount ?? 0;

        while (offset < data.length) {
            if (offset + 2 > data.length) throw new Error('Truncated frame length');
            const frameLength = data.readUInt16LE(offset);
            offset += 2;

            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(readCount++), 4);

            const end = offset + frameLength + 16;
            if (end > data.length) {
                throw new Error(`Truncated frame end=${end} length=${data.length}`);
            }

            const ciphertext = data.subarray(offset, offset + frameLength);
            const authTag = data.subarray(offset + frameLength, end);
            offset = end;

            const plaintext = decryptChacha20(
                this.readKey,
                nonce,
                Buffer.from(Uint16Array.of(frameLength).buffer.slice(0, 2)), // same AAD = leLength
                ciphertext,
                authTag
            );

            result.push(plaintext);
        }

        this.#readCount = readCount;

        return Buffer.concat(result);
    }

    async #encrypt(data: Buffer): Promise<Buffer> {
        const FRAME_LENGTH = 1024;
        const result: Buffer[] = [];

        for (let offset = 0; offset < data.length;) {
            const frame = data.subarray(offset, offset + FRAME_LENGTH);
            offset += frame.length;

            const leLength = Buffer.alloc(2);
            leLength.writeUInt16LE(frame.length, 0);

            const nonce = Buffer.alloc(12);
            nonce.writeBigUInt64LE(BigInt(this.#writeCount++), 4);

            const encrypted = encryptChacha20(
                this.writeKey,
                nonce,
                leLength,
                frame
            );

            result.push(leLength, encrypted.ciphertext, encrypted.authTag);
        }

        return Buffer.concat(result);
    }

    async #handleMessage(message: Proto.ProtocolMessage): Promise<void> {
        if (this.#handler) {
            const [resolve] = this.#handler;
            this.#handler = undefined;

            resolve(message);
        }

        switch (message.type) {
            case Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE:
                await this.#onDeviceInfoMessage(getExtension(message, Proto.deviceInfoMessage));
                break;

            case Proto.ProtocolMessage_Type.ORIGIN_CLIENT_PROPERTIES_MESSAGE:
                await this.#onOriginClientPropertiesMessage(getExtension(message, Proto.originClientPropertiesMessage));
                break;

            case Proto.ProtocolMessage_Type.PLAYER_CLIENT_PROPERTIES_MESSAGE:
                await this.#onPlayerClientPropertiesMessage(getExtension(message, Proto.playerClientPropertiesMessage));
                break;

            case Proto.ProtocolMessage_Type.SEND_COMMAND_RESULT_MESSAGE:
                await this.#onSendCommandResultMessage(getExtension(message, Proto.sendCommandResultMessage));
                break;

            case Proto.ProtocolMessage_Type.SET_ARTWORK_MESSAGE:
                await this.#onSetArtworkMessage(getExtension(message, Proto.setArtworkMessage));
                break;

            case Proto.ProtocolMessage_Type.SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE:
                await this.#onSetDefaultSupportedCommandsMessage(getExtension(message, Proto.setDefaultSupportedCommandsMessage));
                break;

            case Proto.ProtocolMessage_Type.SET_NOW_PLAYING_CLIENT_MESSAGE:
                await this.#onSetNowPlayingClientMessage(getExtension(message, Proto.setNowPlayingClientMessage));
                break;

            case Proto.ProtocolMessage_Type.SET_NOW_PLAYING_PLAYER_MESSAGE:
                await this.#onSetNowPlayingPlayerMessage(getExtension(message, Proto.setNowPlayingPlayerMessage));
                break;

            case Proto.ProtocolMessage_Type.SET_STATE_MESSAGE:
                await this.#onSetStateMessage(getExtension(message, Proto.setStateMessage));
                break;

            case Proto.ProtocolMessage_Type.UPDATE_CLIENT_MESSAGE:
                await this.#onUpdateClientMessage(getExtension(message, Proto.updateClientMessage));
                break;

            case Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_MESSAGE:
                await this.#onUpdateContentItemMessage(getExtension(message, Proto.updateContentItemMessage));
                break;

            case Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE:
                await this.#onUpdateContentItemArtworkMessage(getExtension(message, Proto.updateContentItemArtworkMessage));
                break;

            case Proto.ProtocolMessage_Type.UPDATE_PLAYER_MESSAGE:
                await this.#onUpdatePlayerMessage(getExtension(message, Proto.updatePlayerMessage));
                break;

            case Proto.ProtocolMessage_Type.UPDATE_OUTPUT_DEVICE_MESSAGE:
                await this.#onUpdateOutputDeviceMessage(getExtension(message, Proto.updateOutputDeviceMessage));
                break;

            case Proto.ProtocolMessage_Type.VOLUME_CONTROL_AVAILABILITY_MESSAGE:
                await this.#onVolumeControlAvailabilityMessage(getExtension(message, Proto.volumeControlAvailabilityMessage));
                break;

            case Proto.ProtocolMessage_Type.VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE:
                await this.#onVolumeControlCapabilitiesDidChangeMessage(getExtension(message, Proto.volumeControlCapabilitiesDidChangeMessage));
                break;

            case Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE:
                await this.#onVolumeDidChangeMessage(getExtension(message, Proto.volumeDidChangeMessage));
                break;

            default:
                debug('Received unknown message.', message);
                break;
        }
    }
}

function buildHeader(totalSize: number, seqno: bigint): Buffer {
    const buf = Buffer.alloc(32);

    buf.writeUInt32BE(totalSize, 0);
    buf.write('sync', 4, 'ascii');
    buf.fill(0, 8, 16);
    buf.write('comm', 16, 'ascii');
    buf.writeBigUInt64BE(seqno, 20);
    buf.writeUInt32BE(0, 28);

    return buf;
}

function buildReply(seqno: bigint): Buffer {
    const header = Buffer.alloc(32);
    header.writeUInt32BE(0, 0); // placeholder
    header.write('rply', 4, 'ascii');
    header.fill(0, 8, 16);
    header.writeBigUInt64BE(seqno, 20);
    header.writeUInt32BE(0, 28);

    const plist = Buffer.from(
        serializeBinaryPlist(Buffer.alloc(0) as any)
    );

    const total = header.length + plist.length;
    header.writeUInt32BE(total, 0);

    return Buffer.concat([header, plist]);
}

function encodeVarint(value: number): Uint8Array {
    if (value < 0) {
        throw new RangeError('Varint only supports non-negative integers');
    }

    const bytes: number[] = [];
    while (value > 127) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }

    bytes.push(value);

    return Uint8Array.from(bytes);
}

function parseHeaderSeqno(header: Buffer): bigint {
    if (header.length < 28) {
        throw new Error('Header too short');
    }

    return header.readBigUInt64BE(20);
}

async function parseMessages(content: Buffer): Promise<Proto.ProtocolMessage[]> {
    const messages: Proto.ProtocolMessage[] = [];
    let offset = 0;

    while (offset < content.length) {
        const firstByte = content[offset];

        if (firstByte === 0x08) {
            const message = content.subarray(offset);
            const decoded = fromBinary(Proto.ProtocolMessageSchema, message, {readUnknownFields: true});
            messages.push(decoded);
            break;
        }

        const [length, variantLen] = readVariant(content, offset);
        offset += variantLen;

        if (offset + length > content.length) {
            break;
        }

        const message = content.subarray(offset, offset + length);
        offset += length;

        const decoded = fromBinary(Proto.ProtocolMessageSchema, message, {readUnknownFields: true});
        messages.push(decoded);
    }

    return messages;
}

function readVariant(buf: Buffer, offset = 0): [number, number] {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (true) {
        const byte = buf[offset + bytesRead++];
        result |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            break;
        }

        shift += 7;
    }

    return [result, bytesRead];
}
