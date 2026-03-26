import { ConnectionClosedError, type Context, randomInt32, TimeoutError } from '@basmilius/apple-common';
import { NSKeyedArchiver, Plist } from '@basmilius/apple-encoding';
import { hkdf } from '@basmilius/apple-encryption';
import { type DescExtension, getExtension, toBinary } from '@bufbuild/protobuf';
import { buildHeader, buildReply, encodeVarint, parseHeaderSeqno, parseMessages } from './utils';
import * as Proto from './proto';
import BaseStream from './baseStream';

/** Size of the DataStream frame header in bytes. */
const DATA_HEADER_LENGTH = 32;

/**
 * Decodes a NSKeyedArchiver binary plist into a plain array of objects.
 *
 * Resolves CF$UID references and strips NSObject class metadata, returning
 * raw JavaScript values.
 *
 * @param data - NSKeyedArchiver-encoded binary plist bytes.
 * @returns Array of decoded objects.
 */
const decodeNSKeyedArchiverArray = (data: Uint8Array): unknown[] => {
    const buf = data;
    const archive = Plist.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer) as any;
    return NSKeyedArchiver.decodeAsArray(archive);
};

/**
 * Events emitted by the DataStream, one per MRP protobuf message type.
 *
 * Each event carries the decoded protobuf extension message. The `rawMessage`
 * event fires for every message before type-specific dispatch, useful for
 * debugging or catch-all handling.
 */
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

/**
 * Protobuf-based MRP (Media Remote Protocol) data stream for AirPlay.
 *
 * The DataStream carries bidirectional protobuf messages over an encrypted TCP
 * connection. Messages are wrapped in a 32-byte header (sync/comm/rply tags)
 * with plist-encoded payloads containing varint-length-prefixed ProtocolMessage
 * protobuf bytes.
 *
 * Supports request/response exchanges via {@link exchange} (with timeout) and
 * fire-and-forget via {@link send}. Incoming messages are dispatched to registered
 * type handlers that emit typed events for now-playing updates, volume changes,
 * keyboard input, device info, and more.
 */
export default class DataStream extends BaseStream<EventMap> {
    /** Accumulated plaintext buffer for partial frame reassembly. */
    #buffer: Buffer = Buffer.alloc(0);
    /** Accumulated encrypted data awaiting decryption (may be a partial ChaCha20 frame). */
    #encryptedBuffer: Buffer = Buffer.alloc(0);
    /** Outgoing sequence number counter, initialized to a random value above 0x100000000. */
    #seqno: bigint;
    /** Outstanding request/response exchanges awaiting a response, keyed by message identifier. */
    #outstanding: Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
    /** Registered message type handlers mapping ProtocolMessage_Type to [extension descriptor, handler function]. */
    #handlers: Record<number, [DescExtension, Function]> = {};

    /**
     * @param context - Shared context with logger and device identity.
     * @param address - IP address of the AirPlay receiver.
     * @param port - TCP port for the data stream (received from SETUP response).
     */
    constructor(context: Context, address: string, port: number) {
        super(context, address, port);

        this.#seqno = 0x100000000n + BigInt(randomInt32());

        this.onStreamClose = this.onStreamClose.bind(this);
        this.onStreamData = this.onStreamData.bind(this);
        this.onStreamError = this.onStreamError.bind(this);

        this.on('close', this.onStreamClose);
        this.on('data', this.onStreamData);
        this.on('error', this.onStreamError);

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
        this.#handlers[Proto.ProtocolMessage_Type.SYNC_OUTPUT_DEVICES_MESSAGE] = [Proto.updateOutputDeviceMessage, this.#onUpdateOutputDeviceMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_CONTROL_AVAILABILITY_MESSAGE] = [Proto.volumeControlAvailabilityMessage, this.#onVolumeControlAvailabilityMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE] = [Proto.volumeControlCapabilitiesDidChangeMessage, this.#onVolumeControlCapabilitiesDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE] = [Proto.volumeDidChangeMessage, this.#onVolumeDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.VOLUME_MUTED_DID_CHANGE_MESSAGE] = [Proto.volumeMutedDidChangeMessage, this.#onVolumeMutedDidChangeMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.SEND_LYRICS_EVENT] = [Proto.sendLyricsEventMessage, this.#onSendLyricsEventMessage.bind(this)];
        this.#handlers[Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE] = [Proto.configureConnectionMessage, this.#onConfigureConnectionMessage.bind(this)];
    }

    /**
     * Disconnects the data stream, rejecting all outstanding exchanges and clearing buffers.
     */
    async disconnect(): Promise<void> {
        this.#cleanup();
        await super.disconnect();
    }

    /**
     * Sends a protobuf message and waits for a matching response.
     *
     * The response is matched by the message's `identifier` field, or by
     * `type_{messageType}` if no identifier is set. Times out if no response
     * arrives within the given duration.
     *
     * @param message - The ProtocolMessage to send, optionally with its extension descriptor.
     * @param timeout - Maximum time to wait for a response in milliseconds.
     * @returns The response ProtocolMessage.
     * @throws TimeoutError if no response is received within the timeout.
     */
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

    /**
     * Sends an acknowledgement reply for a received 'sync' frame.
     *
     * @param seqno - Sequence number from the received frame header to acknowledge.
     */
    reply(seqno: bigint): void {
        const rply = buildReply(seqno);

        this.context.logger.raw('[data]', `Sending reply packet seqno=${seqno}`);

        this.write(this.encrypt(rply));
    }

    /**
     * Sends a protobuf message as a fire-and-forget (no response expected).
     *
     * The message is serialized to protobuf, wrapped in a varint-length prefix,
     * embedded in a plist payload, and framed with a 32-byte DataStream header.
     * The entire frame is encrypted before transmission.
     *
     * @param message - The ProtocolMessage to send, optionally with its extension descriptor for logging.
     */
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

    /**
     * Derives encryption keys from the shared secret and enables encryption.
     *
     * Uses HKDF-SHA512 with a seed-specific salt (`DataStream-Salt{seed}`) and
     * direction-specific info strings. The seed ensures each DataStream session
     * gets unique keys even with the same shared secret.
     *
     * @param sharedSecret - Shared secret from pair-verify.
     * @param seed - Random 64-bit seed sent in the SETUP request.
     */
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

    /**
     * Clears internal buffers and rejects all outstanding exchanges.
     */
    #cleanup(): void {
        this.#buffer = Buffer.alloc(0);
        this.#encryptedBuffer = Buffer.alloc(0);

        for (const [id, req] of this.#outstanding) {
            clearTimeout(req.timer);
            req.reject(new ConnectionClosedError());
        }

        this.#outstanding.clear();
    }

    /**
     * Handles stream close by cleaning up outstanding exchanges and buffers.
     */
    onStreamClose(): void {
        this.#cleanup();
    }

    /**
     * Handles stream errors by rejecting all outstanding exchanges.
     *
     * @param err - The error that occurred on the stream.
     */
    onStreamError(err: Error): void {
        this.context.logger.error('[data]', 'onStreamError()', err);

        for (const [id, req] of this.#outstanding) {
            clearTimeout(req.timer);
            req.reject(err);
        }

        this.#outstanding.clear();
    }

    /**
     * Processes incoming TCP data from the data stream.
     *
     * Handles the two-buffer pattern for encrypted connections: encrypted data
     * accumulates in `#encryptedBuffer` until a complete ChaCha20 frame can be
     * decrypted, then plaintext is appended to `#buffer` for frame parsing.
     *
     * Each frame consists of a 32-byte header followed by a plist payload.
     * The header's command tag determines handling:
     * - 'sync': parse protobuf messages from payload, then send a reply
     * - 'rply': resolve the first outstanding exchange
     *
     * @param data - Raw data from the TCP socket.
     */
    async onStreamData(data: Buffer): Promise<void> {
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
            this.context.logger.error('[data]', 'onStreamData()', err);
            this.emit('error', err);
        }
    }

    /**
     * Dispatches a decoded ProtocolMessage to the appropriate handler.
     *
     * First emits a `rawMessage` event, then checks if the message matches
     * an outstanding exchange (resolving it if so), and finally dispatches
     * to the registered type handler which emits a typed event.
     *
     * @param message - Decoded ProtocolMessage to handle.
     */
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

    /**
     * Handles an incoming keyboard message (text input session state).
     *
     * @param message - The decoded KeyboardMessage.
     */
    #onKeyboardMessage(message: Proto.KeyboardMessage): void {
        this.context.logger.info('[data]', 'Keyboard message', message);

        this.emit('keyboard', message);
    }

    /**
     * Handles the initial device info message received after connection.
     *
     * @param message - The decoded DeviceInfoMessage with the device's name, model, etc.
     */
    #onDeviceInfoMessage(message: Proto.DeviceInfoMessage): void {
        this.context.logger.info('[data]', 'Connected to device', message.name);

        this.emit('deviceInfo', message);
    }

    /**
     * Handles a device info update (e.g. name change, capability change).
     *
     * @param message - The decoded DeviceInfoMessage with updated information.
     */
    #onDeviceInfoUpdateMessage(message: Proto.DeviceInfoMessage): void {
        this.context.logger.info('[data]', 'Device info update', message);

        this.emit('deviceInfoUpdate', message);
    }

    /**
     * Handles origin client properties (identifies the app providing content).
     *
     * @param message - The decoded OriginClientPropertiesMessage.
     */
    #onOriginClientPropertiesMessage(message: Proto.OriginClientPropertiesMessage): void {
        this.context.logger.raw('[data]', 'Origin client properties', message);

        this.emit('originClientProperties', message);
    }

    /**
     * Handles player client properties (player-specific metadata).
     *
     * @param message - The decoded PlayerClientPropertiesMessage.
     */
    #onPlayerClientPropertiesMessage(message: Proto.PlayerClientPropertiesMessage): void {
        this.context.logger.raw('[data]', 'Player client properties', message);

        this.emit('playerClientProperties', message);
    }

    /**
     * Handles a client removal notification.
     *
     * @param message - The decoded RemoveClientMessage.
     */
    #onRemoveClientMessage(message: Proto.RemoveClientMessage): void {
        this.context.logger.info('[data]', 'Remove client', message);

        this.emit('removeClient', message);
    }

    /**
     * Handles a player removal notification.
     *
     * @param message - The decoded RemovePlayerMessage.
     */
    #onRemovePlayerMessage(message: Proto.RemovePlayerMessage): void {
        this.context.logger.info('[data]', 'Remove player', message);

        this.emit('removePlayer', message);
    }

    /**
     * Handles the result of a previously sent command.
     *
     * @param message - The decoded SendCommandResultMessage.
     */
    #onSendCommandResultMessage(message: Proto.SendCommandResultMessage): void {
        this.context.logger.info('[data]', 'Send command result', message);

        this.emit('sendCommandResult', message);
    }

    /**
     * Handles artwork data for the current now-playing item.
     *
     * @param message - The decoded SetArtworkMessage containing image data.
     */
    #onSetArtworkMessage(message: Proto.SetArtworkMessage): void {
        this.context.logger.info('[data]', 'Set artwork', message);

        this.emit('setArtwork', message);
    }

    /**
     * Handles the list of commands supported by the current player.
     *
     * @param message - The decoded SetDefaultSupportedCommandsMessage.
     */
    #onSetDefaultSupportedCommandsMessage(message: Proto.SetDefaultSupportedCommandsMessage): void {
        this.context.logger.info('[data]', 'Set default supported commands', message);

        this.emit('setDefaultSupportedCommands', message);
    }

    /**
     * Handles a change in the active now-playing client (app).
     *
     * @param message - The decoded SetNowPlayingClientMessage.
     */
    #onSetNowPlayingClientMessage(message: Proto.SetNowPlayingClientMessage): void {
        this.context.logger.info('[data]', 'Set now playing client', message);

        this.emit('setNowPlayingClient', message);
    }

    /**
     * Handles a change in the active now-playing player within a client.
     *
     * @param message - The decoded SetNowPlayingPlayerMessage.
     */
    #onSetNowPlayingPlayerMessage(message: Proto.SetNowPlayingPlayerMessage): void {
        this.context.logger.info('[data]', 'Set now playing player', message);

        this.emit('setNowPlayingPlayer', message);
    }

    /**
     * Handles a device state change (e.g. playback state transitions).
     *
     * @param message - The decoded SetStateMessage.
     */
    #onSetStateMessage(message: Proto.SetStateMessage): void {
        this.context.logger.info('[data]', 'Set state', message);

        this.emit('setState', message);
    }

    /**
     * Handles a client update (e.g. bundle identifier, display name changes).
     *
     * @param message - The decoded UpdateClientMessage.
     */
    #onUpdateClientMessage(message: Proto.UpdateClientMessage): void {
        this.context.logger.info('[data]', 'Update client', message);

        this.emit('updateClient', message);
    }

    /**
     * Handles a content item update (now-playing metadata: title, artist, album, etc.).
     *
     * @param message - The decoded UpdateContentItemMessage.
     */
    #onUpdateContentItemMessage(message: Proto.UpdateContentItemMessage): void {
        this.context.logger.info('[data]', 'Update content item', message);

        this.emit('updateContentItem', message);
    }

    /**
     * Handles artwork updates for a content item.
     *
     * @param message - The decoded UpdateContentItemArtworkMessage.
     */
    #onUpdateContentItemArtworkMessage(message: Proto.UpdateContentItemArtworkMessage): void {
        this.context.logger.info('[data]', 'Update content artwork', message);

        this.emit('updateContentItemArtwork', message);
    }

    /**
     * Handles a player update (playback rate, elapsed time, queue position, etc.).
     *
     * @param message - The decoded UpdatePlayerMessage.
     */
    #onUpdatePlayerMessage(message: Proto.UpdatePlayerMessage): void {
        this.context.logger.info('[data]', 'Update player', message);

        this.emit('updatePlayer', message);
    }

    /**
     * Handles output device updates (speaker name, UID, grouping changes).
     *
     * @param message - The decoded UpdateOutputDeviceMessage.
     */
    #onUpdateOutputDeviceMessage(message: Proto.UpdateOutputDeviceMessage): void {
        this.context.logger.info('[data]', 'Update output device', message);

        this.emit('updateOutputDevice', message);
    }

    /**
     * Handles volume control availability changes.
     *
     * @param message - The decoded VolumeControlAvailabilityMessage.
     */
    #onVolumeControlAvailabilityMessage(message: Proto.VolumeControlAvailabilityMessage): void {
        this.context.logger.info('[data]', 'Volume control availability', message);

        this.emit('volumeControlAvailability', message);
    }

    /**
     * Handles volume control capability changes (e.g. absolute vs relative volume).
     *
     * @param message - The decoded VolumeControlCapabilitiesDidChangeMessage.
     */
    #onVolumeControlCapabilitiesDidChangeMessage(message: Proto.VolumeControlCapabilitiesDidChangeMessage): void {
        this.context.logger.info('[data]', 'Volume control capabilities did change', message);

        this.emit('volumeControlCapabilitiesDidChange', message);
    }

    /**
     * Handles a volume level change.
     *
     * @param message - The decoded VolumeDidChangeMessage with the new volume.
     */
    #onVolumeDidChangeMessage(message: Proto.VolumeDidChangeMessage): void {
        this.context.logger.info('[data]', 'VolumeDidChange message', message);

        this.emit('volumeDidChange', message);
    }

    /**
     * Handles a mute state change.
     *
     * @param message - The decoded VolumeMutedDidChangeMessage.
     */
    #onVolumeMutedDidChangeMessage(message: Proto.VolumeMutedDidChangeMessage): void {
        this.context.logger.info('[data]', 'VolumeMutedDidChange message', message);

        this.emit('volumeMutedDidChange', message);
    }

    /**
     * Handles a lyrics event (real-time lyrics synchronization data).
     *
     * @param message - The decoded SendLyricsEventMessage.
     */
    #onSendLyricsEventMessage(message: Proto.SendLyricsEventMessage): void {
        this.context.logger.raw('[data]', 'SendLyricsEvent message', message);

        this.emit('sendLyricsEvent', message);
    }

    /**
     * Handles a connection configuration message (group ID assignment).
     *
     * @param message - The decoded ConfigureConnectionMessage.
     */
    #onConfigureConnectionMessage(message: Proto.ConfigureConnectionMessage): void {
        this.context.logger.info('[data]', 'ConfigureConnection message', message);

        this.emit('configureConnection', message);
    }
}
