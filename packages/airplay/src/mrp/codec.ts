import { type DescExtension, fromBinary, getExtension } from '@bufbuild/protobuf';
import * as Proto from './proto';

/** The decoded extension of every MRP message type this package understands, by the name it goes by. */
export type MrpMessageMap = {
    readonly configureConnection: Proto.ConfigureConnectionMessage;
    readonly deviceInfo: Proto.DeviceInfoMessage;
    readonly deviceInfoUpdate: Proto.DeviceInfoMessage;
    readonly keyboard: Proto.KeyboardMessage;
    readonly originClientProperties: Proto.OriginClientPropertiesMessage;
    readonly playerClientProperties: Proto.PlayerClientPropertiesMessage;
    readonly removeClient: Proto.RemoveClientMessage;
    readonly removePlayer: Proto.RemovePlayerMessage;
    readonly sendCommandResult: Proto.SendCommandResultMessage;
    readonly sendLyricsEvent: Proto.SendLyricsEventMessage;
    readonly setArtwork: Proto.SetArtworkMessage;
    readonly setDefaultSupportedCommands: Proto.SetDefaultSupportedCommandsMessage;
    readonly setNowPlayingClient: Proto.SetNowPlayingClientMessage;
    readonly setNowPlayingPlayer: Proto.SetNowPlayingPlayerMessage;
    readonly setState: Proto.SetStateMessage;
    readonly updateClient: Proto.UpdateClientMessage;
    readonly updateContentItem: Proto.UpdateContentItemMessage;
    readonly updateContentItemArtwork: Proto.UpdateContentItemArtworkMessage;
    readonly updatePlayer: Proto.UpdatePlayerMessage;
    readonly updateOutputDevice: Proto.UpdateOutputDeviceMessage;
    readonly playerClientParticipantsUpdate: Proto.PlayerClientParticipantsUpdateMessage;
    readonly volumeControlAvailability: Proto.VolumeControlAvailabilityMessage;
    readonly volumeControlCapabilitiesDidChange: Proto.VolumeControlCapabilitiesDidChangeMessage;
    readonly volumeDidChange: Proto.VolumeDidChangeMessage;
    readonly volumeMutedDidChange: Proto.VolumeMutedDidChangeMessage;

    readonly audioFade: Proto.AudioFadeMessage;
    readonly audioFadeResponse: Proto.AudioFadeResponseMessage;
    readonly adjustVolume: Proto.AdjustVolumeMessage;
    readonly getVolumeResult: Proto.GetVolumeResultMessage;
    readonly getVolumeMutedResult: Proto.GetVolumeMutedResultMessage;
    readonly notification: Proto.NotificationMessage;
    readonly setConnectionState: Proto.SetConnectionStateMessage;
    readonly setDiscoveryMode: Proto.SetDiscoveryModeMessage;
    readonly setListeningMode: Proto.SetListeningModeMessage;
    readonly transaction: Proto.TransactionMessage;
    readonly updateActiveSystemEndpoint: Proto.UpdateActiveSystemEndpointMessage;
    readonly updateEndpoints: Proto.UpdateEndPointsMessage;
    readonly removeEndpoints: Proto.RemoveEndpointsMessage;
    readonly removeOutputDevices: Proto.RemoveOutputDevicesMessage;
    readonly wakeDevice: Proto.WakeDeviceMessage;
    readonly genericMessage: Proto.GenericMessage;
    readonly playbackSessionRequest: Proto.PlaybackSessionRequestMessage;
    readonly playbackSessionResponse: Proto.PlaybackSessionResponseMessage;
    readonly playbackSessionMigrateRequest: Proto.PlaybackSessionMigrateRequestMessage;
    readonly playbackSessionMigrateResponse: Proto.PlaybackSessionMigrateResponseMessage;
    readonly playbackSessionMigrateBegin: Proto.PlaybackSessionMigrateBeginMessage;
    readonly playbackSessionMigrateEnd: Proto.PlaybackSessionMigrateEndMessage;
    readonly playbackSessionMigratePost: Proto.PlaybackSessionMigratePostMessage;
    readonly createHostedEndpointRequest: Proto.CreateHostedEndpointRequest;
    readonly createHostedEndpointResponse: Proto.CreateHostedEndpointResponse;
    readonly promptForRouteAuthorization: Proto.PromptForRouteAuthorizationMessage;
    readonly promptForRouteAuthorizationResponse: Proto.PromptForRouteAuthorizationResponseMessage;
    readonly presentRouteAuthorizationStatus: Proto.PresentRouteAuthorizationStatusMessage;
    readonly requestGroupSession: Proto.RequestGroupSessionMessage;
    readonly microphoneConnectionRequest: Proto.MicrophoneConnectionRequestMessage;
    readonly microphoneConnectionResponse: Proto.MicrophoneConnectionResponseMessage;
    readonly createApplicationConnection: Proto.CreateApplicationConnectionMessage;
    readonly setHiliteMode: Proto.SetHiliteModeMessage;
    readonly textInput: Proto.TextInputMessage;
    readonly remoteTextInput: Proto.RemoteTextInputMessage;
    readonly cryptoPairing: Proto.CryptoPairingMessage;
    readonly gameController: Proto.GameControllerMessage;
    readonly gameControllerProperties: Proto.GameControllerPropertiesMessage;
    readonly registerGameController: Proto.RegisterGameControllerMessage;
    readonly registerGameControllerResponse: Proto.RegisterGameControllerResponseMessage;
};

export type MrpMessageName = keyof MrpMessageMap;

/** A decoded message as a `[name, extension]` pair, the form {@link MediaRemoteState.apply} takes. */
export type MrpMessage = { [K in MrpMessageName]: [K, MrpMessageMap[K]] }[MrpMessageName];

/** How a message type decodes, and the log level for it; `raw` is for the chatty ones. */
export type MessageKind = {
    readonly extension: DescExtension;
    readonly name: MrpMessageName;
    readonly level: 'info' | 'raw';
};

const MESSAGES: readonly [Proto.ProtocolMessage_Type, DescExtension, MrpMessageName, ('info' | 'raw')?][] = [
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

const KINDS: ReadonlyMap<number, MessageKind> = new Map(MESSAGES.map(([type, extension, name, level = 'info']) => [type, {extension, name, level}]));

/** How a message type decodes; undefined for a type this package does not know. */
export function messageKind(type: Proto.ProtocolMessage_Type): MessageKind | undefined {
    return KINDS.get(type);
}

/**
 * Decodes the extension of a ProtocolMessage into a `[name, extension]` pair, for example to feed
 * recorded traffic into a {@link MediaRemoteState}.
 *
 * @returns Null for a message type this package does not know.
 * @throws When the extension does not decode.
 */
export function decodeMessage(message: Proto.ProtocolMessage): MrpMessage | null {
    const kind = KINDS.get(message.type);

    if (!kind) {
        return null;
    }

    return [kind.name, getExtension(message, kind.extension)] as MrpMessage;
}

/**
 * Encodes an integer as a protobuf varint: 7 data bits per byte, the MSB as continuation flag.
 *
 * @throws {RangeError} When the value is not an integer in the uint32 range.
 */
export function encodeVarint(value: number): Uint8Array {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new RangeError('Varint only supports uint32 integers');
    }

    const bytes: number[] = [];

    while (value > 127) {
        bytes.push((value & 0x7f) | 0x80);
        value >>>= 7;
    }

    bytes.push(value);

    return Uint8Array.from(bytes);
}

/**
 * Parses ProtocolMessages framed as `[varint length][protobuf bytes]`, repeated. A buffer that
 * does not parse that way and starts with field tag 0x08 is read as one legacy bare message
 * without a length prefix.
 */
export function parseMessages(content: Buffer): Proto.ProtocolMessage[] {
    try {
        const messages: Proto.ProtocolMessage[] = [];
        let offset = 0;

        while (offset < content.length) {
            const [length, prefixLength] = readVariant(content, offset);
            offset += prefixLength;

            if (length === 0 || length > content.length - offset) {
                throw new RangeError('Invalid protobuf message length');
            }

            messages.push(fromBinary(Proto.ProtocolMessageSchema, content.subarray(offset, offset + length), {readUnknownFields: true}));
            offset += length;
        }

        return messages;
    } catch (error) {
        // A length prefix of eight is also the first field tag of a legacy bare message.
        if (content[0] !== 0x08) throw error;

        return [fromBinary(Proto.ProtocolMessageSchema, content, {readUnknownFields: true})];
    }
}

/**
 * Reads a uint32 varint at `offset`.
 *
 * @returns The decoded value and the number of bytes consumed.
 * @throws {RangeError} When the varint is truncated or exceeds uint32.
 */
export function readVariant(buf: Buffer, offset = 0): [number, number] {
    let result = 0;

    for (let i = 0; i < 5; i++) {
        if (offset + i >= buf.length) throw new RangeError('Truncated varint');

        const byte = buf[offset + i];

        if (i === 4 && byte > 0x0f) throw new RangeError('Varint exceeds uint32');

        result += (byte & 0x7f) * 2 ** (7 * i);

        if ((byte & 0x80) === 0) return [result, i + 1];
    }

    throw new RangeError('Varint exceeds uint32');
}
