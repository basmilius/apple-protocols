import { ConnectionClosedError, randomInt32, reporter, TimeoutError } from '@corewire/core';
import type { Context } from '@corewire/core/transport';
import { deriveEncryptionKeys } from '@corewire/core/crypto';
import { Plist } from '@corewire/core/encoding';
import { type DescExtension, getExtension, toBinary } from '@bufbuild/protobuf';
import { describeProtocolMessage } from '../describeProtocolMessage';
import * as Proto from '../proto';
import { buildHeader, buildReply, encodeVarint, parseHeaderSeqno, parseMessages } from '../utils';
import { EncryptedChannel } from './encrypted';

/** Size of the frame header in bytes. */
const DATA_HEADER_LENGTH = 32;

/** Largest frame we accept; anything bigger is a broken length field. */
const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/** MRP exchange timeout in milliseconds. */
const EXCHANGE_TIMEOUT = 5000;

/** One event per MRP message type, with the decoded extension. `rawMessage` fires first for every message. */
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
    readonly playerClientParticipantsUpdate: [Proto.PlayerClientParticipantsUpdateMessage];
    readonly volumeControlAvailability: [Proto.VolumeControlAvailabilityMessage];
    readonly volumeControlCapabilitiesDidChange: [Proto.VolumeControlCapabilitiesDidChangeMessage];
    readonly volumeDidChange: [Proto.VolumeDidChangeMessage];
    readonly volumeMutedDidChange: [Proto.VolumeMutedDidChangeMessage];

    readonly audioFade: [Proto.AudioFadeMessage];
    readonly audioFadeResponse: [Proto.AudioFadeResponseMessage];
    readonly adjustVolume: [Proto.AdjustVolumeMessage];
    readonly getVolumeResult: [Proto.GetVolumeResultMessage];
    readonly getVolumeMutedResult: [Proto.GetVolumeMutedResultMessage];
    readonly notification: [Proto.NotificationMessage];
    readonly setConnectionState: [Proto.SetConnectionStateMessage];
    readonly setDiscoveryMode: [Proto.SetDiscoveryModeMessage];
    readonly setListeningMode: [Proto.SetListeningModeMessage];
    readonly transaction: [Proto.TransactionMessage];
    readonly updateActiveSystemEndpoint: [Proto.UpdateActiveSystemEndpointMessage];
    readonly updateEndpoints: [Proto.UpdateEndPointsMessage];
    readonly removeEndpoints: [Proto.RemoveEndpointsMessage];
    readonly removeOutputDevices: [Proto.RemoveOutputDevicesMessage];
    readonly wakeDevice: [Proto.WakeDeviceMessage];
    readonly genericMessage: [Proto.GenericMessage];
    readonly playbackSessionRequest: [Proto.PlaybackSessionRequestMessage];
    readonly playbackSessionResponse: [Proto.PlaybackSessionResponseMessage];
    readonly playbackSessionMigrateRequest: [Proto.PlaybackSessionMigrateRequestMessage];
    readonly playbackSessionMigrateResponse: [Proto.PlaybackSessionMigrateResponseMessage];
    readonly playbackSessionMigrateBegin: [Proto.PlaybackSessionMigrateBeginMessage];
    readonly playbackSessionMigrateEnd: [Proto.PlaybackSessionMigrateEndMessage];
    readonly playbackSessionMigratePost: [Proto.PlaybackSessionMigratePostMessage];
    readonly createHostedEndpointRequest: [Proto.CreateHostedEndpointRequest];
    readonly createHostedEndpointResponse: [Proto.CreateHostedEndpointResponse];
    readonly promptForRouteAuthorization: [Proto.PromptForRouteAuthorizationMessage];
    readonly promptForRouteAuthorizationResponse: [Proto.PromptForRouteAuthorizationResponseMessage];
    readonly presentRouteAuthorizationStatus: [Proto.PresentRouteAuthorizationStatusMessage];
    readonly requestGroupSession: [Proto.RequestGroupSessionMessage];
    readonly microphoneConnectionRequest: [Proto.MicrophoneConnectionRequestMessage];
    readonly microphoneConnectionResponse: [Proto.MicrophoneConnectionResponseMessage];
    readonly createApplicationConnection: [Proto.CreateApplicationConnectionMessage];
    readonly setHiliteMode: [Proto.SetHiliteModeMessage];
    readonly textInput: [Proto.TextInputMessage];
    readonly remoteTextInput: [Proto.RemoteTextInputMessage];
    readonly cryptoPairing: [Proto.CryptoPairingMessage];
    readonly gameController: [Proto.GameControllerMessage];
    readonly gameControllerProperties: [Proto.GameControllerPropertiesMessage];
    readonly registerGameController: [Proto.RegisterGameControllerMessage];
    readonly registerGameControllerResponse: [Proto.RegisterGameControllerResponseMessage];
};

type MessageEvent = Exclude<keyof EventMap, 'rawMessage'>;

type Outstanding = {
    readonly resolve: (message: Proto.ProtocolMessage) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
};

/** Message type, its extension and the event it becomes. Raw-level logging is for the chatty ones. */
const MESSAGES: readonly [Proto.ProtocolMessage_Type, DescExtension, MessageEvent, ('info' | 'raw')?][] = [
    [Proto.ProtocolMessage_Type.KEYBOARD_MESSAGE, Proto.keyboardMessage, 'keyboard'],
    [Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE, Proto.deviceInfoMessage, 'deviceInfo'],
    [Proto.ProtocolMessage_Type.DEVICE_INFO_UPDATE_MESSAGE, Proto.deviceInfoMessage, 'deviceInfoUpdate'],
    [Proto.ProtocolMessage_Type.ORIGIN_CLIENT_PROPERTIES_MESSAGE, Proto.originClientPropertiesMessage, 'originClientProperties', 'raw'],
    [Proto.ProtocolMessage_Type.PLAYER_CLIENT_PROPERTIES_MESSAGE, Proto.playerClientPropertiesMessage, 'playerClientProperties', 'raw'],
    [Proto.ProtocolMessage_Type.SEND_COMMAND_RESULT_MESSAGE, Proto.sendCommandResultMessage, 'sendCommandResult'],
    [Proto.ProtocolMessage_Type.SET_ARTWORK_MESSAGE, Proto.setArtworkMessage, 'setArtwork'],
    [Proto.ProtocolMessage_Type.SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE, Proto.setDefaultSupportedCommandsMessage, 'setDefaultSupportedCommands'],
    [Proto.ProtocolMessage_Type.SET_NOW_PLAYING_CLIENT_MESSAGE, Proto.setNowPlayingClientMessage, 'setNowPlayingClient'],
    [Proto.ProtocolMessage_Type.SET_NOW_PLAYING_PLAYER_MESSAGE, Proto.setNowPlayingPlayerMessage, 'setNowPlayingPlayer'],
    [Proto.ProtocolMessage_Type.SET_STATE_MESSAGE, Proto.setStateMessage, 'setState'],
    [Proto.ProtocolMessage_Type.REMOVE_CLIENT_MESSAGE, Proto.removeClientMessage, 'removeClient'],
    [Proto.ProtocolMessage_Type.REMOVE_PLAYER_MESSAGE, Proto.removePlayerMessage, 'removePlayer'],
    [Proto.ProtocolMessage_Type.UPDATE_CLIENT_MESSAGE, Proto.updateClientMessage, 'updateClient'],
    [Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_MESSAGE, Proto.updateContentItemMessage, 'updateContentItem'],
    [Proto.ProtocolMessage_Type.UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE, Proto.updateContentItemArtworkMessage, 'updateContentItemArtwork'],
    [Proto.ProtocolMessage_Type.UPDATE_PLAYER_MESSAGE, Proto.updatePlayerMessage, 'updatePlayer'],
    [Proto.ProtocolMessage_Type.SYNC_OUTPUT_DEVICES_MESSAGE, Proto.updateOutputDeviceMessage, 'updateOutputDevice'],
    [Proto.ProtocolMessage_Type.VOLUME_CONTROL_AVAILABILITY_MESSAGE, Proto.volumeControlAvailabilityMessage, 'volumeControlAvailability'],
    [Proto.ProtocolMessage_Type.VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE, Proto.volumeControlCapabilitiesDidChangeMessage, 'volumeControlCapabilitiesDidChange'],
    [Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE, Proto.volumeDidChangeMessage, 'volumeDidChange'],
    [Proto.ProtocolMessage_Type.VOLUME_MUTED_DID_CHANGE_MESSAGE, Proto.volumeMutedDidChangeMessage, 'volumeMutedDidChange'],
    [Proto.ProtocolMessage_Type.SEND_LYRICS_EVENT, Proto.sendLyricsEventMessage, 'sendLyricsEvent', 'raw'],
    [Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE, Proto.configureConnectionMessage, 'configureConnection'],
    [Proto.ProtocolMessage_Type.PLAYER_CLIENT_PARTICIPANTS_UPDATE_MESSAGE, Proto.playerClientParticipantsUpdateMessage, 'playerClientParticipantsUpdate'],
    [Proto.ProtocolMessage_Type.AUDIO_FADE_MESSAGE, Proto.audioFadeMessage, 'audioFade'],
    [Proto.ProtocolMessage_Type.AUDIO_FADE_RESPONSE_MESSAGE, Proto.audioFadeResponseMessage, 'audioFadeResponse'],
    [Proto.ProtocolMessage_Type.ADJUST_VOLUME_MESSAGE, Proto.adjustVolumeMessage, 'adjustVolume'],
    [Proto.ProtocolMessage_Type.GET_VOLUME_RESULT_MESSAGE, Proto.getVolumeResultMessage, 'getVolumeResult'],
    [Proto.ProtocolMessage_Type.GET_VOLUME_MUTED_RESULT_MESSAGE, Proto.getVolumeMutedResultMessage, 'getVolumeMutedResult'],
    [Proto.ProtocolMessage_Type.NOTIFICATION_MESSAGE, Proto.notificationMessage, 'notification'],
    [Proto.ProtocolMessage_Type.SET_CONNECTION_STATE_MESSAGE, Proto.setConnectionStateMessage, 'setConnectionState'],
    [Proto.ProtocolMessage_Type.SET_DISCOVERY_MODE_MESSAGE, Proto.setDiscoveryModeMessage, 'setDiscoveryMode'],
    [Proto.ProtocolMessage_Type.SET_LISTENING_MODE_MESSAGE, Proto.setListeningModeMessage, 'setListeningMode'],
    [Proto.ProtocolMessage_Type.TRANSACTION_MESSAGE, Proto.transactionMessage, 'transaction'],
    [Proto.ProtocolMessage_Type.UPDATE_ACTIVE_SYSTEM_ENDPOINT_MESSAGE, Proto.updateActiveSystemEndpointMessage, 'updateActiveSystemEndpoint'],
    [Proto.ProtocolMessage_Type.UPDATE_SYNCED_ENDPOINTS_MESSAGE, Proto.updateEndPointsMessage, 'updateEndpoints'],
    [Proto.ProtocolMessage_Type.REMOVE_SYNCED_ENDPOINTS_MESSAGE, Proto.removeEndpointsMessage, 'removeEndpoints'],
    [Proto.ProtocolMessage_Type.REMOVE_SYNCED_OUTPUT_DEVICES_MESSAGE, Proto.removeOutputDevicesMessage, 'removeOutputDevices'],
    [Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE, Proto.wakeDeviceMessage, 'wakeDevice'],
    [Proto.ProtocolMessage_Type.GENERIC_MESSAGE, Proto.genericMessage, 'genericMessage'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_REQUEST_MESSAGE, Proto.playbackSessionRequestMessage, 'playbackSessionRequest'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_RESPONSE_MESSAGE, Proto.playbackSessionResponseMessage, 'playbackSessionResponse'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_REQUEST_MESSAGE, Proto.playbackSessionMigrateRequestMessage, 'playbackSessionMigrateRequest'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_RESPONSE_MESSAGE, Proto.playbackSessionMigrateResponseMessage, 'playbackSessionMigrateResponse'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_BEGIN_MESSAGE, Proto.playbackSessionMigrateBeginMessage, 'playbackSessionMigrateBegin'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_END_MESSAGE, Proto.playbackSessionMigrateEndMessage, 'playbackSessionMigrateEnd'],
    [Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_POST_MESSAGE, Proto.playbackSessionMigratePostMessage, 'playbackSessionMigratePost'],
    [Proto.ProtocolMessage_Type.CREATE_HOSTED_ENDPOINT_REQUEST_MESSAGE, Proto.createHostedEndpointRequest, 'createHostedEndpointRequest'],
    [Proto.ProtocolMessage_Type.CREATE_HOSTED_ENDPOINT_RESPONSE_MESSAGE, Proto.createHostedEndpointResponse, 'createHostedEndpointResponse'],
    [Proto.ProtocolMessage_Type.PROMPT_FOR_ROUTE_AUTHORIZATION_MESSAGE, Proto.promptForRouteAuthorizationMessage, 'promptForRouteAuthorization'],
    [Proto.ProtocolMessage_Type.PROMPT_FOR_ROUTE_AUTHORIZATION_RESPONSE_MESSAGE, Proto.promptForRouteAuthorizationResponseMessage, 'promptForRouteAuthorizationResponse'],
    [Proto.ProtocolMessage_Type.PRESENT_ROUTE_AUTHORIZATION_STATUS_MESSAGE, Proto.presentRouteAuthorizationStatusMessage, 'presentRouteAuthorizationStatus'],
    [Proto.ProtocolMessage_Type.REQUEST_GROUP_SESSION_MESSAGE, Proto.requestGroupSessionMessage, 'requestGroupSession'],
    [Proto.ProtocolMessage_Type.MICROPHONE_CONNECTION_REQUEST_MESSAGE, Proto.microphoneConnectionRequestMessage, 'microphoneConnectionRequest'],
    [Proto.ProtocolMessage_Type.MICROPHONE_CONNECTION_RESPONSE_MESSAGE, Proto.microphoneConnectionResponseMessage, 'microphoneConnectionResponse'],
    [Proto.ProtocolMessage_Type.CREATE_APPLICATION_CONNECTION_MESSAGE, Proto.createApplicationConnectionMessage, 'createApplicationConnection'],
    [Proto.ProtocolMessage_Type.SET_HILITE_MODE_MESSAGE, Proto.setHiliteModeMessage, 'setHiliteMode'],
    [Proto.ProtocolMessage_Type.TEXT_INPUT_MESSAGE, Proto.textInputMessage, 'textInput'],
    [Proto.ProtocolMessage_Type.REMOTE_TEXT_INPUT_MESSAGE, Proto.remoteTextInputMessage, 'remoteTextInput'],
    [Proto.ProtocolMessage_Type.CRYPTO_PAIRING_MESSAGE, Proto.cryptoPairingMessage, 'cryptoPairing'],
    [Proto.ProtocolMessage_Type.GAME_CONTROLLER_MESSAGE, Proto.gameControllerMessage, 'gameController'],
    [Proto.ProtocolMessage_Type.GAME_CONTROLLER_PROPERTIES_MESSAGE, Proto.gameControllerPropertiesMessage, 'gameControllerProperties'],
    [Proto.ProtocolMessage_Type.REGISTER_GAME_CONTROLLER_MESSAGE, Proto.registerGameControllerMessage, 'registerGameController'],
    [Proto.ProtocolMessage_Type.REGISTER_GAME_CONTROLLER_RESPONSE_MESSAGE, Proto.registerGameControllerResponseMessage, 'registerGameControllerResponse']
];

const MESSAGES_BY_TYPE: ReadonlyMap<number, (typeof MESSAGES)[number]> = new Map(MESSAGES.map(entry => [entry[0], entry]));

/**
 * The MRP channel: protobuf messages over the dedicated data socket. A 32-byte header wraps a
 * plist whose `params.data` holds varint-prefixed ProtocolMessages. {@link exchange} waits for the
 * reply with the same identifier, {@link send} expects none; every incoming message becomes an
 * event. Keys come from the pair-verify secret and the seed of the SETUP that announced the port.
 */
export class DataChannel extends EncryptedChannel<EventMap> {
    readonly #outstanding: Map<string, Outstanding> = new Map();
    #seqno: bigint;

    constructor(context: Context, address: string, port: number, sharedSecret: Buffer, seed: bigint) {
        super(context, address, port, deriveEncryptionKeys(sharedSecret, `DataStream-Salt${seed}`, 'DataStream-Input-Encryption-Key', 'DataStream-Output-Encryption-Key'));

        this.#seqno = 0x100000000n + BigInt(randomInt32());

        this.on('closed', () => this.#rejectAll(new ConnectionClosedError()));
        this.on('error', (error: Error) => {
            this.context.logger.error('[data]', 'Data channel error.', error);
            this.#rejectAll(error);
        });
    }

    /**
     * Sends a message and resolves with the reply that carries the same `identifier`, or the
     * first message of the same type when the message has no identifier.
     *
     * @throws {TimeoutError} When no reply arrives in time.
     * @throws {ConnectionClosedError} When the channel ends first.
     */
    exchange(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension], timeout: number = EXCHANGE_TIMEOUT): Promise<Proto.ProtocolMessage> {
        const msg = Array.isArray(message) ? message[0] : message;
        const identifier = msg.identifier || `type_${msg.type}`;

        if (this.signal.aborted) {
            return Promise.reject(new ConnectionClosedError());
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#outstanding.delete(identifier);
                reject(new TimeoutError(`Exchange timed out for ${identifier}`));
            }, timeout);

            this.#outstanding.set(identifier, {resolve, reject, timer});

            try {
                this.send(message);
            } catch (err) {
                this.#outstanding.delete(identifier);
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    /** Sends a message without waiting for a reply. */
    send(message: Proto.ProtocolMessage | [Proto.ProtocolMessage, DescExtension]): void {
        if (Array.isArray(message)) {
            message = message[0];
        }

        // Extensions travel as unknown fields; without them the payload is lost.
        const bytes = toBinary(Proto.ProtocolMessageSchema, message, {writeUnknownFields: true});
        const payload = Buffer.concat([Buffer.from(encodeVarint(bytes.byteLength)), bytes]);

        const plistPayload = Buffer.from(Plist.serialize({
            params: {
                data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
            }
        }));

        const header = buildHeader(DATA_HEADER_LENGTH + plistPayload.byteLength, this.#seqno++);

        if (reporter.tapsTraffic || reporter.accepts('raw')) {
            const decoded = describeProtocolMessage(message);
            this.context.logger.raw('[data]', `Sending message. ${decoded.typeName}`, decoded);
            this.#tap('out', decoded, bytes);
        }

        this.writeEncrypted(Buffer.concat([header, plistPayload]));
    }

    /** Frames are a 32-byte header and a plist payload. `sync` frames get a `rply`; `rply` frames only acknowledge transport. */
    protected receive(plaintext: Buffer, received: number): number {
        let offset = 0;

        while (plaintext.byteLength - offset >= DATA_HEADER_LENGTH) {
            const header = plaintext.subarray(offset, offset + DATA_HEADER_LENGTH);
            const totalLength = header.readUint32BE();

            if (totalLength < DATA_HEADER_LENGTH || totalLength > MAX_FRAME_LENGTH) {
                throw new Error(`Invalid DataStream frame length: ${totalLength}`);
            }

            if (plaintext.byteLength - offset < totalLength) {
                this.context.logger.warn('[data]', `Data packet is too short needed=${totalLength} available=${plaintext.byteLength - offset} receivedLength=${received}`);
                break;
            }

            const frame = plaintext.subarray(offset + DATA_HEADER_LENGTH, offset + totalLength);
            const plist = frame.length > 0
                ? Plist.parse(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer) as {params?: {data?: ArrayBuffer}}
                : null;
            const command = header.toString('ascii', 4, 8);

            offset += totalLength;

            if (plist?.params?.data) {
                for (const message of parseMessages(Buffer.from(plist.params.data))) {
                    if (reporter.tapsTraffic || reporter.accepts('raw')) {
                        const decoded = describeProtocolMessage(message);
                        this.context.logger.raw('[data]', `Received message. ${decoded.typeName}`, decoded);
                        this.#tap('in', decoded);
                    }

                    this.#handleMessage(message);
                }
            }

            if (command === 'sync') {
                this.#reply(parseHeaderSeqno(header));
            }
        }

        return offset;
    }

    #reply(seqno: bigint): void {
        this.context.logger.raw('[data]', `Sending reply packet seqno=${seqno}`);
        this.writeEncrypted(buildReply(seqno));
    }

    /** Emits `rawMessage`, settles a matching exchange, then emits the typed event. */
    #handleMessage(message: Proto.ProtocolMessage): void {
        this.emit('rawMessage', message);

        const identifier = message.identifier || `type_${message.type}`;
        const outstanding = this.#outstanding.get(identifier);

        if (outstanding) {
            this.#outstanding.delete(identifier);
            clearTimeout(outstanding.timer);
            outstanding.resolve(message);
        }

        const entry = MESSAGES_BY_TYPE.get(message.type);

        if (!entry) {
            if (message.type !== Proto.ProtocolMessage_Type.UNKNOWN_MESSAGE) {
                this.context.logger.warn('[data]', `Unknown message type ${message.type}.`);
            }

            return;
        }

        const [, extension, event, level = 'info'] = entry;
        let decoded: unknown;

        try {
            decoded = getExtension(message, extension);
        } catch (err) {
            this.context.logger.error('[data]', `Failed to parse extension for message type ${message.type}:`, err);

            return;
        }

        this.context.logger[level]('[data]', event, decoded);

        try {
            (this.emit as (event: string, ...args: unknown[]) => boolean)(event, decoded);
        } catch (err) {
            this.context.logger.error('[data]', `A listener for ${event} failed:`, err);
        }
    }

    #rejectAll(error: Error): void {
        for (const {reject, timer} of this.#outstanding.values()) {
            clearTimeout(timer);
            reject(error);
        }

        this.#outstanding.clear();
    }

    #tap(direction: 'in' | 'out', decoded: Record<string, unknown>, bytes?: Uint8Array): void {
        if (!reporter.tapsTraffic) {
            return;
        }

        this.context.logger.traffic('dataStream', direction, String(decoded.typeName), decoded, bytes);
    }
}
