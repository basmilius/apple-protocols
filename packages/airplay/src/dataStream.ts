import { ConnectionClosedError, type Context, randomInt32, TimeoutError } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { hkdf } from '@basmilius/apple-encryption';
import { type DescExtension, getExtension, toBinary } from '@bufbuild/protobuf';
import { buildHeader, buildReply, encodeVarint, parseHeaderSeqno, parseMessages } from './utils';
import * as Proto from './proto';
import BaseStream from './baseStream';

const DATA_HEADER_LENGTH = 32;

/**
 * Decodes a NSKeyedArchiver binary plist into a plain array of objects.
 * Resolves CF$UID references and strips NSObject class metadata.
 */
const decodeNSKeyedArchiverArray = (data: Uint8Array): unknown[] => {
    const buf = data;
    const archive = Plist.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer) as any;
    const objects = archive?.['$objects'];

    if (!objects) {
        return [];
    }

    const resolve = (ref: unknown): unknown => {
        if (ref && typeof ref === 'object' && 'CF$UID' in (ref as any)) {
            return resolve(objects[(ref as any)['CF$UID']]);
        }

        if (ref === '$null') {
            return null;
        }

        if (ref && typeof ref === 'object') {
            const obj = ref as Record<string, unknown>;

            // NSArray
            if (obj['NS.objects'] && Array.isArray(obj['NS.objects'])) {
                return (obj['NS.objects'] as unknown[]).map(resolve);
            }

            // NSDictionary
            if (obj['NS.keys'] && Array.isArray(obj['NS.keys'])) {
                const keys = (obj['NS.keys'] as unknown[]).map(resolve) as string[];
                const values = (obj['NS.objects'] as unknown[]).map(resolve);
                const result: Record<string, unknown> = {};

                for (let i = 0; i < keys.length; i++) {
                    result[keys[i]] = values[i];
                }

                return result;
            }

            // Plain object — resolve all values, skip $class
            const result: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(obj)) {
                if (key === '$class' || key === '$classname' || key === '$classes') {
                    continue;
                }

                result[key] = resolve(value);
            }

            return result;
        }

        return ref;
    };

    const root = resolve(archive['$top']?.root ?? archive['$top']);
    return Array.isArray(root) ? root : [root];
};

type EventMap = {
    readonly rawMessage: [Proto.ProtocolMessage];
    readonly configureConnection: [Proto.ConfigureConnectionMessage];
    readonly deviceInfo: [Proto.DeviceInfoMessage];
    readonly deviceInfoUpdate: [Proto.DeviceInfoMessage];
    readonly keyboard: [Proto.KeyboardMessage];
    readonly originClientProperties: [Proto.OriginClientPropertiesMessage];
    readonly playerClientProperties: [Proto.PlayerClientPropertiesMessage];
    readonly removeClient: [Proto.RemoveClientMessage];
    readonly removePlayer: [Proto.RemovePlayerMessage];
    readonly sendCommandResult: [Proto.SendCommandResultMessage];
    readonly sendLyricsEvent: [Proto.SendLyricsEventMessage];
    readonly setArtwork: [Proto.SetArtworkMessage];
    readonly setDefaultSupportedCommands: [Proto.SetDefaultSupportedCommandsMessage];
    readonly setNowPlayingClient: [Proto.SetNowPlayingClientMessage];
    readonly setNowPlayingPlayer: [Proto.SetNowPlayingPlayerMessage];
    readonly setState: [Proto.SetStateMessage];
    readonly updateClient: [Proto.UpdateClientMessage];
    readonly updateContentItem: [Proto.UpdateContentItemMessage];
    readonly updateContentItemArtwork: [Proto.UpdateContentItemArtworkMessage];
    readonly updatePlayer: [Proto.UpdatePlayerMessage];
    readonly updateOutputDevice: [Proto.UpdateOutputDeviceMessage];
    readonly volumeControlAvailability: [Proto.VolumeControlAvailabilityMessage];
    readonly volumeControlCapabilitiesDidChange: [Proto.VolumeControlCapabilitiesDidChangeMessage];
    readonly volumeDidChange: [Proto.VolumeDidChangeMessage];
    readonly volumeMutedDidChange: [Proto.VolumeMutedDidChangeMessage];
};

export default class DataStream extends BaseStream<EventMap> {
    #buffer: Buffer = Buffer.alloc(0);
    #encryptedBuffer: Buffer = Buffer.alloc(0);
    #seqno: bigint;
    #outstanding: Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
    #handlers: Record<number, [DescExtension, Function]> = {};

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#seqno = 0x100000000n + BigInt(randomInt32());

        this.on('close', this.#onClose.bind(this));
        this.on('data', this.#onData.bind(this));
        this.on('error', this.#onError.bind(this));

        this.#handlers[Proto.ProtocolMessage_Type.KEYBOARD_MESSAGE] = [Proto.keyboardMessage, this.#onKeyboardMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE] = [Proto.deviceInfoMessage, this.#onDeviceInfoMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.DEVICE_INFO_UPDATE_MESSAGE] = [Proto.deviceInfoMessage, this.#onDeviceInfoUpdateMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.ORIGIN_CLIENT_PROPERTIES_MESSAGE] = [Proto.originClientPropertiesMessage, this.#onOriginClientPropertiesMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.PLAYER_CLIENT_PROPERTIES_MESSAGE] = [Proto.playerClientPropertiesMessage, this.#onPlayerClientPropertiesMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SEND_COMMAND_RESULT_MESSAGE] = [Proto.sendCommandResultMessage, this.#onSendCommandResultMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SET_ARTWORK_MESSAGE] = [Proto.setArtworkMessage, this.#onSetArtworkMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE] = [Proto.setDefaultSupportedCommandsMessage, this.#onSetDefaultSupportedCommandsMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SET_NOW_PLAYING_CLIENT_MESSAGE] = [Proto.setNowPlayingClientMessage, this.#onSetNowPlayingClientMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SET_NOW_PLAYING_PLAYER_MESSAGE] = [Proto.setNowPlayingPlayerMessage, this.#onSetNowPlayingPlayerMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SET_STATE_MESSAGE] = [Proto.setStateMessage, this.#onSetStateMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.REMOVE_CLIENT_MESSAGE] = [Proto.removeClientMessage, this.#onRemoveClientMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.REMOVE_PLAYER_MESSAGE] = [Proto.removePlayerMessage, this.#onRemovePlayerMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.UPDATE_CLIENT_MESSAGE] = [Proto.updateClientMessage, this.#onUpdateClientMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_MESSAGE] = [Proto.updateContentItemMessage, this.#onUpdateContentItemMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE] = [Proto.updateContentItemArtworkMessage, this.#onUpdateContentItemArtworkMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.UPDATE_PLAYER_MESSAGE] = [Proto.updatePlayerMessage, this.#onUpdatePlayerMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.UPDATE_OUTPUT_DEVICE_MESSAGE] = [Proto.updateOutputDeviceMessage, this.#onUpdateOutputDeviceMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_CONTROL_AVAILABILITY_MESSAGE] = [Proto.volumeControlAvailabilityMessage, this.#onVolumeControlAvailabilityMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE] = [Proto.volumeControlCapabilitiesDidChangeMessage, this.#onVolumeControlCapabilitiesDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE] = [Proto.volumeDidChangeMessage, this.#onVolumeDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_MUTED_DID_CHANGE_MESSAGE] = [Proto.volumeMutedDidChangeMessage, this.#onVolumeMutedDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SEND_LYRICS_EVENT] = [Proto.sendLyricsEventMessage, this.#onSendLyricsEventMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE] = [Proto.configureConnectionMessage, this.#onConfigureConnectionMessage.bind(this)];
    }

    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    exchange(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension], timeout: number = 5000): Promise<Proto.ProtocolMessage> {
        let msg = Array.isArray(message) ? message[0] : message;
        const identifier = msg.identifier || `type_${msg.type}`;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#outstanding.delete(identifier);
                reject(new TimeoutError(`Exchange timed out for ${identifier}`));
            }, timeout);

            this.#outstanding.set(identifier, { resolve, reject, timer });

            try {
                this.send(message);
            } catch (err) {
                this.#outstanding.delete(identifier);
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    reply(seqno: bigint): void {
        const rply = buildReply(seqno);

        this.context.logger.raw('[data]', `Sending reply packet seqno=${seqno}`);

        this.write(this.encrypt(rply));
    }

    send(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension]): void {
        let extension: DescExtension | undefined;

        if (Array.isArray(message)) {
            extension = message[1];
            message = message[0];
        }

        const bytes = toBinary(Proto.ProtocolMessageSchema, message, {writeUnknownFields: true});
        const lengthPrefix = Buffer.from(encodeVarint(bytes.byteLength));
        const payload = Buffer.concat([lengthPrefix, bytes]);

        const plistPayload = Buffer.from(
            Plist.serialize({
                params: {
                    data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
                }
            })
        );

        const header = buildHeader(DATA_HEADER_LENGTH + plistPayload.byteLength, this.#seqno++);
        let frame: Buffer = Buffer.concat([header, plistPayload]);

        if (this.isEncrypted) {
            frame = this.encrypt(frame);
        }

        this.context.logger.raw('[data]', 'Sending message.', message.type, extension ? getExtension(message, extension) : message);

        this.write(frame);
    }

    setup(sharedSecret: Buffer, seed: bigint): void {
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

        this.enableEncryption(readKey, writeKey);
    }

    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);

        for (const [id, req] of this.#outstanding) {
            clearTimeout(req.timer);
            req.reject(new ConnectionClosedError());
        }

        this.#outstanding.clear();
    }

    #onClose(): void {
        this.#cleanup();
    }

    #onError(err: Error): void {
        this.context.logger.error('[data]', '#onError()', err);

        for (const [id, req] of this.#outstanding) {
            clearTimeout(req.timer);
            req.reject(err);
        }

        this.#outstanding.clear();
    }

    async #onData(data: Buffer): Promise<void> {
        try {
            if (this.isEncrypted) {
                this.#encryptedBuffer = Buffer.concat([this.#encryptedBuffer, data]);

                const decrypted = this.decrypt(this.#encryptedBuffer);

                if (!decrypted) {
                    return;
                }

                this.#encryptedBuffer = Buffer.alloc(0);
                this.#buffer = Buffer.concat([this.#buffer, decrypted]);
            } else {
                this.#buffer = Buffer.concat([this.#buffer, data]);
            }

            while (this.#buffer.byteLength > DATA_HEADER_LENGTH) {
                const header = this.#buffer.subarray(0, DATA_HEADER_LENGTH);
                const totalLength = header.readUint32BE();

                if (this.#buffer.byteLength < totalLength) {
                    this.context.logger.warn('[data]', `Data packet is too short needed=${totalLength} available=${this.#buffer.byteLength} receivedLength=${data.byteLength}`);
                    return;
                }

                const frame = this.#buffer.subarray(DATA_HEADER_LENGTH, totalLength);
                const plist = Plist.parse(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as any) as any;
                const command = header.toString('ascii', 4, 8);

                this.#buffer = this.#buffer.subarray(totalLength);

                if (!plist || !plist.params || !plist.params.data) {
                    if (command === 'rply') {
                        this.context.logger.raw('[data]', 'Received reply packet.');

                        // Resolve the oldest outstanding exchange — rply is the
                        // DataStream-level acknowledgment for our sent message.
                        // FIFO order is guaranteed because we use TCP (ordered delivery)
                        // and the Apple TV processes requests sequentially.
                        const first = this.#outstanding.entries().next();

                        if (!first.done) {
                            const [id, req] = first.value;
                            this.#outstanding.delete(id);
                            clearTimeout(req.timer);
                            req.resolve(undefined);
                        }
                    } else if (command === 'sync') {
                        this.reply(parseHeaderSeqno(header));
                    }

                    continue;
                }

                const content = Buffer.from(plist.params.data);

                for (const message of parseMessages(content)) {
                    this.context.logger.raw('[data]', `Received message.`, message);
                    this.#handleMessage(message);
                }

                if (command === 'sync') {
                    this.reply(parseHeaderSeqno(header));
                }
            }
        } catch (err) {
            this.context.logger.error('[data]', '#onData()', err);
            this.emit('error', err);
        }
    }

    #handleMessage(message: Proto.ProtocolMessage): void {
        this.emit('rawMessage', message);

        // Check if this is a response to an outstanding exchange
        const identifier = message.identifier || `type_${message.type}`;
        const outstanding = this.#outstanding.get(identifier);

        if (outstanding) {
            this.#outstanding.delete(identifier);
            clearTimeout(outstanding.timer);
            outstanding.resolve(message);
        }

        // Always dispatch to type handlers (state tracking, events, etc.)
        if (message.type in this.#handlers) {
            const [extension, handler] = this.#handlers[message.type];

            try {
                handler(getExtension(message, extension));
            } catch (err) {
                this.context.logger.error('[data]', `Failed to parse extension for message type ${message.type}:`, err);
            }
        } else if (message.type !== Proto.ProtocolMessage_Type.UNKNOWN_MESSAGE) {
            this.context.logger.warn('[data]', `Unknown message type ${message.type}.`);
        }
    }

    #onKeyboardMessage(message: Proto.KeyboardMessage): void {
        this.context.logger.info('[data]', 'Keyboard message', message);

        this.emit('keyboard', message);
    }

    #onDeviceInfoMessage(message: Proto.DeviceInfoMessage): void {
        this.context.logger.info('[data]', 'Connected to device', message.name);

        this.emit('deviceInfo', message);
    }

    #onDeviceInfoUpdateMessage(message: Proto.DeviceInfoMessage): void {
        this.context.logger.info('[data]', 'Device info update', message);

        this.emit('deviceInfoUpdate', message);
    }

    #onOriginClientPropertiesMessage(message: Proto.OriginClientPropertiesMessage): void {
        this.context.logger.raw('[data]', 'Origin client properties', message);

        this.emit('originClientProperties', message);
    }

    #onPlayerClientPropertiesMessage(message: Proto.PlayerClientPropertiesMessage): void {
        this.context.logger.raw('[data]', 'Player client properties', message);

        this.emit('playerClientProperties', message);
    }

    #onRemoveClientMessage(message: Proto.RemoveClientMessage): void {
        this.context.logger.info('[data]', 'Remove client', message);

        this.emit('removeClient', message);
    }

    #onRemovePlayerMessage(message: Proto.RemovePlayerMessage): void {
        this.context.logger.info('[data]', 'Remove player', message);

        this.emit('removePlayer', message);
    }

    #onSendCommandResultMessage(message: Proto.SendCommandResultMessage): void {
        this.context.logger.info('[data]', 'Send command result', message);

        this.emit('sendCommandResult', message);
    }

    #onSetArtworkMessage(message: Proto.SetArtworkMessage): void {
        this.context.logger.info('[data]', 'Set artwork', message);

        this.emit('setArtwork', message);
    }

    #onSetDefaultSupportedCommandsMessage(message: Proto.SetDefaultSupportedCommandsMessage): void {
        this.context.logger.info('[data]', 'Set default supported commands', message);

        this.emit('setDefaultSupportedCommands', message);
    }

    #onSetNowPlayingClientMessage(message: Proto.SetNowPlayingClientMessage): void {
        this.context.logger.info('[data]', 'Set now playing client', message);

        this.emit('setNowPlayingClient', message);
    }

    #onSetNowPlayingPlayerMessage(message: Proto.SetNowPlayingPlayerMessage): void {
        this.context.logger.info('[data]', 'Set now playing player', message);

        this.emit('setNowPlayingPlayer', message);
    }

    #onSetStateMessage(message: Proto.SetStateMessage): void {
        this.context.logger.info('[data]', 'Set state', message);

        this.emit('setState', message);
    }

    #onUpdateClientMessage(message: Proto.UpdateClientMessage): void {
        this.context.logger.info('[data]', 'Update client', message);

        this.emit('updateClient', message);
    }

    #onUpdateContentItemMessage(message: Proto.UpdateContentItemMessage): void {
        this.context.logger.info('[data]', 'Update content item', message);

        this.emit('updateContentItem', message);
    }

    #onUpdateContentItemArtworkMessage(message: Proto.UpdateContentItemArtworkMessage): void {
        this.context.logger.info('[data]', 'Update content artwork', message);

        this.emit('updateContentItemArtwork', message);
    }

    #onUpdatePlayerMessage(message: Proto.UpdatePlayerMessage): void {
        this.context.logger.info('[data]', 'Update player', message);

        this.emit('updatePlayer', message);
    }

    #onUpdateOutputDeviceMessage(message: Proto.UpdateOutputDeviceMessage): void {
        this.context.logger.info('[data]', 'Update output device', message);

        this.emit('updateOutputDevice', message);
    }

    #onVolumeControlAvailabilityMessage(message: Proto.VolumeControlAvailabilityMessage): void {
        this.context.logger.info('[data]', 'Volume control availability', message);

        this.emit('volumeControlAvailability', message);
    }

    #onVolumeControlCapabilitiesDidChangeMessage(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
        this.context.logger.info('[data]', 'Volume control capabilities did change', message);

        this.emit('volumeControlCapabilitiesDidChange', message);
    }

    #onVolumeDidChangeMessage(message: Proto.VolumeDidChangeMessage): void {
        this.context.logger.info('[data]', 'VolumeDidChange message', message);

        this.emit('volumeDidChange', message);
    }

    #onVolumeMutedDidChangeMessage(message: Proto.VolumeMutedDidChangeMessage): void {
        this.context.logger.info('[data]', 'VolumeMutedDidChange message', message);

        this.emit('volumeMutedDidChange', message);
    }

    #onSendLyricsEventMessage(message: Proto.SendLyricsEventMessage): void {
        this.context.logger.raw('[data]', 'SendLyricsEvent message', message);

        this.emit('sendLyricsEvent', message);
    }

    #onConfigureConnectionMessage(message: Proto.ConfigureConnectionMessage): void {
        this.context.logger.info('[data]', 'ConfigureConnection message', message);

        this.emit('configureConnection', message);
    }
}
