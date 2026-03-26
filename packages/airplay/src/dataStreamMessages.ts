import { type DeviceIdentity, uint16ToBE, uuid } from '@basmilius/apple-common';
import { create, DescExtension, type Extendee, type ExtensionValueShape, getExtension as _getExtension, setExtension } from '@bufbuild/protobuf';
import * as Proto from './proto';

/**
 * Creates a base ProtocolMessage with a given type and error code.
 *
 * Assigns random UUIDs for both identifier and uniqueIdentifier fields,
 * which are used for request/response matching in the DataStream.
 *
 * @param type - The protobuf message type enum value.
 * @param errorCode - Error code to include (defaults to NoError).
 * @returns A new ProtocolMessage ready for extension attachment.
 */
export function protocol(type: Proto.ProtocolMessage_Type, errorCode: Proto.ErrorCode_Enum = Proto.ErrorCode_Enum.NoError): Proto.ProtocolMessage {
    return create(Proto.ProtocolMessageSchema, {
        type,
        errorCode,
        identifier: uuid().toUpperCase(),
        uniqueIdentifier: uuid().toUpperCase()
    });
}

/**
 * Builds a CLIENT_UPDATES_CONFIG message to subscribe to state change notifications.
 *
 * Tells the Apple TV which categories of updates we want to receive on the
 * DataStream. Should be sent early in the session to start receiving
 * now-playing, volume, and artwork updates.
 *
 * @param artworkUpdates - Subscribe to artwork change events.
 * @param nowPlayingUpdates - Subscribe to now-playing metadata changes.
 * @param volumeUpdates - Subscribe to volume change events.
 * @param keyboardUpdates - Subscribe to keyboard/text input session events.
 * @param outputDeviceUpdates - Subscribe to output device (speaker) changes.
 * @param systemEndpointUpdates - Subscribe to system endpoint changes.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function clientUpdatesConfig(artworkUpdates: boolean = true, nowPlayingUpdates: boolean = true, volumeUpdates: boolean = true, keyboardUpdates: boolean = false, outputDeviceUpdates: boolean = true, systemEndpointUpdates: boolean = true): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
    const message = create(Proto.ClientUpdatesConfigMessageSchema, {
        artworkUpdates,
        nowPlayingUpdates,
        volumeUpdates,
        keyboardUpdates,
        outputDeviceUpdates,
        systemEndpointUpdates
    });

    setExtension(protocolMessage, Proto.clientUpdatesConfigMessage, message);

    return [
        protocolMessage,
        Proto.clientUpdatesConfigMessage
    ];
}

/**
 * Builds a CONFIGURE_CONNECTION message to set the group ID for this connection.
 *
 * @param groupId - The group identifier for this connection.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function configureConnection(groupId: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE);
    const message = create(Proto.ConfigureConnectionMessageSchema, {
        groupID: groupId
    });

    setExtension(protocolMessage, Proto.configureConnectionMessage, message);

    return [
        protocolMessage,
        Proto.configureConnectionMessage
    ];
}

/**
 * Builds a DEVICE_INFO message identifying this controller to the Apple TV.
 *
 * Sent during session initialization. Includes device model, capabilities,
 * supported features, and pairing information.
 *
 * @param pairingId - Pairing identifier from pair-verify.
 * @param identity - Device identity with name, model, and version info.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function deviceInfo(pairingId: Buffer, identity: DeviceIdentity): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE);
    const message = create(Proto.DeviceInfoMessageSchema, {
        uniqueIdentifier: pairingId.toString(),
        name: identity.name,
        localizedModelName: 'iPhone',
        systemBuildVersion: identity.osBuildVersion,
        applicationBundleIdentifier: identity.applicationBundleIdentifier,
        applicationBundleVersion: identity.applicationBundleVersion,
        protocolVersion: 1,
        lastSupportedMessageType: 139,
        supportsSystemPairing: true,
        allowsPairing: true,
        systemMediaApplication: 'com.apple.TVMusic',
        supportsACL: true,
        supportsSharedQueue: true,
        supportsExtendedMotion: true,
        sharedQueueVersion: 2,
        deviceClass: Proto.DeviceClass_Enum.iPhone,
        logicalDeviceCount: 1,
        modelID: identity.model,
        clusterType: 0,
        isClusterAware: true,
        supportsOutputContextSync: true,
        computerName: identity.name
    });

    setExtension(protocolMessage, Proto.deviceInfoMessage, message);

    return [
        protocolMessage,
        Proto.deviceInfoMessage
    ];
}

/**
 * Builds a MODIFY_OUTPUT_CONTEXT_REQUEST message to change the audio output devices.
 *
 * Used for multi-room audio to add, remove, or set the list of output speakers.
 *
 * @param addingDevices - Device UIDs to add to the output context.
 * @param removingDevices - Device UIDs to remove from the output context.
 * @param settingDevices - Device UIDs to set as the complete output context.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function modifyOutputContext(addingDevices: string[] = [], removingDevices: string[] = [], settingDevices: string[] = []): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
    const message = create(Proto.ModifyOutputContextRequestMessageSchema, {
        outputContextType: Proto.ModifyOutputContextRequestType_Enum.SharedAudioPresentation,
        addingOutputDeviceUIDs: addingDevices,
        removingOutputDeviceUIDs: removingDevices,
        settingOutputDeviceUIDs: settingDevices,
        clusterAwareAddingOutputDeviceUIDs: addingDevices,
        clusterAwareRemovingOutputDeviceUIDs: removingDevices,
        clusterAwareSettingOutputDeviceUIDs: settingDevices
    });

    setExtension(protocolMessage, Proto.modifyOutputContextRequestMessage, message);

    return [
        protocolMessage,
        Proto.modifyOutputContextRequestMessage
    ];
}

/**
 * Builds a GET_STATE message to request the current playback state.
 *
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function getState(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_STATE_MESSAGE);
    const message = create(Proto.GetStateMessageSchema, {});

    setExtension(protocolMessage, Proto.getStateMessage, message);

    return [
        protocolMessage,
        Proto.getStateMessage
    ];
}

/**
 * Builds a GET_VOLUME message to query the current volume of an output device.
 *
 * @param outputDeviceUID - UID of the output device to query.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function getVolume(outputDeviceUID: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_VOLUME_MESSAGE);
    const message = create(Proto.GetVolumeMessageSchema, {
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.getVolumeMessage, message);

    return [
        protocolMessage,
        Proto.getVolumeMessage
    ];
}

/**
 * Builds a GET_VOLUME_MUTED message to query the mute state of an output device.
 *
 * @param outputDeviceUID - UID of the output device to query.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function getVolumeMuted(outputDeviceUID: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_VOLUME_MUTED_MESSAGE);
    const message = create(Proto.GetVolumeMutedMessageSchema, {
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.getVolumeMutedMessage, message);

    return [
        protocolMessage,
        Proto.getVolumeMutedMessage
    ];
}

/**
 * Builds a NOTIFICATION message to send a named notification to the device.
 *
 * @param notification - Notification name string.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function notification(notification: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.NOTIFICATION_MESSAGE);
    const message = create(Proto.NotificationMessageSchema, {
        notification
    });

    setExtension(protocolMessage, Proto.notificationMessage, message);

    return [
        protocolMessage,
        Proto.notificationMessage
    ];
}

/**
 * Builds a PLAYBACK_QUEUE_REQUEST message to retrieve the playback queue.
 *
 * Requests detailed queue information including metadata, lyrics, artwork,
 * sections, participants, and animated artwork formats.
 *
 * @param location - Starting index in the queue.
 * @param length - Number of items to retrieve.
 * @param artworkWidth - Desired artwork width in pixels.
 * @param artworkHeight - Desired artwork height in pixels (-1 for proportional).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function playbackQueueRequest(location: number, length: number, artworkWidth: number = 600, artworkHeight: number = -1): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.PLAYBACK_QUEUE_REQUEST_MESSAGE);
    const message = create(Proto.PlaybackQueueRequestMessageSchema, {
        location,
        length,
        artworkWidth,
        artworkHeight,
        returnContentItemAssetsInUserCompletion: true,
        includeMetadata: true,
        includeLanguageOptions: false,
        includeInfo: true,
        includeLyrics: true,
        includeSections: true,
        includeAlignments: true,
        includeAvailableArtworkFormats: true,
        includeParticipants: true,
        isLegacyNowPlayingInfoRequest: false,
        requestedArtworkFormats: ['MRContentItemArtworkFormatStandard'],
        requestedRemoteArtworkFormats: ['MRContentItemArtworkFormatStandard'],
        requestedAnimatedArtworkPreviewFrameFormats: ['MRContentItemAnimatedArtworkFormatSquare', 'MRContentItemAnimatedArtworkFormatTall'],
        requestedAnimatedArtworkAssetURLFormats: ['MRContentItemAnimatedArtworkFormatSquare', 'MRContentItemAnimatedArtworkFormatTall']
    });

    setExtension(protocolMessage, Proto.playbackQueueRequestMessage, message);

    return [
        protocolMessage,
        Proto.playbackQueueRequestMessage
    ];
}

/**
 * Builds a GET_KEYBOARD_SESSION message to request the current keyboard session state.
 *
 * Used to check if a text input field is active on the Apple TV.
 *
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function getKeyboardSession(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_KEYBOARD_SESSION_MESSAGE);

    setExtension(protocolMessage, Proto.getKeyboardSessionMessage, '');

    return [
        protocolMessage,
        Proto.getKeyboardSessionMessage
    ];
}

/**
 * Builds a TEXT_INPUT message to send text to an active keyboard session.
 *
 * @param text - The text string to input.
 * @param actionType - The action type (e.g. done, search, send).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function textInput(text: string, actionType: Proto.ActionType_Enum): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.TEXT_INPUT_MESSAGE);
    const message = create(Proto.TextInputMessageSchema, {
        timestamp: Date.now() / 1000,
        text,
        actionType
    });

    setExtension(protocolMessage, Proto.textInputMessage, message);

    return [
        protocolMessage,
        Proto.textInputMessage
    ];
}

/**
 * Builds a SEND_BUTTON_EVENT message for a USB HID button press or release.
 *
 * @param usagePage - HID usage page (e.g. 0x01 for Generic Desktop, 0x0c for Consumer).
 * @param usage - HID usage code within the page.
 * @param buttonDown - `true` for key down, `false` for key up.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendButtonEvent(usagePage: number, usage: number, buttonDown: boolean): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_BUTTON_EVENT_MESSAGE);
    const message = create(Proto.SendButtonEventMessageSchema, {
        usagePage,
        usage,
        buttonDown
    });

    setExtension(protocolMessage, Proto.sendButtonEventMessage, message);

    return [
        protocolMessage,
        Proto.sendButtonEventMessage
    ];
}

/**
 * Builds a SEND_COMMAND message with a skip interval option.
 *
 * @param command - The playback command to send.
 * @param skipInterval - Number of seconds to skip forward or backward.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommandWithSkipInterval(command: Proto.Command, skipInterval: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { skipInterval }));
}

/**
 * Builds a SEND_COMMAND message with a playback position option.
 *
 * @param command - The playback command to send.
 * @param playbackPosition - Target playback position in seconds.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommandWithPlaybackPosition(command: Proto.Command, playbackPosition: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackPosition }));
}

/**
 * Builds a SEND_COMMAND message with a playback rate option.
 *
 * @param command - The playback command to send.
 * @param playbackRate - Target playback rate (e.g. 1.0 for normal, 2.0 for double speed).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommandWithPlaybackRate(command: Proto.Command, playbackRate: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackRate }));
}

/**
 * Builds a SEND_COMMAND message with a shuffle mode option.
 *
 * @param command - The playback command to send.
 * @param shuffleMode - The shuffle mode to set.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommandWithShuffleMode(command: Proto.Command, shuffleMode: Proto.ShuffleMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { shuffleMode }));
}

/**
 * Builds a SEND_COMMAND message with a repeat mode option.
 *
 * @param command - The playback command to send.
 * @param repeatMode - The repeat mode to set.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommandWithRepeatMode(command: Proto.Command, repeatMode: Proto.RepeatMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { repeatMode }));
}

/**
 * Builds a SEND_COMMAND message to execute a playback command.
 *
 * This is the base command builder used by all `sendCommandWith*` variants.
 *
 * @param command - The playback command to send (play, pause, next track, etc.).
 * @param options - Optional command options (skip interval, position, rate, etc.).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendCommand(command: Proto.Command, options?: Proto.CommandOptions): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_COMMAND_MESSAGE);
    const message = create(Proto.SendCommandMessageSchema, {
        command,
        options
    });

    setExtension(protocolMessage, Proto.sendCommandMessage, message);

    return [
        protocolMessage,
        Proto.sendCommandMessage
    ];
}

/**
 * Builds a SEND_VIRTUAL_TOUCH_EVENT message for touchpad simulation.
 *
 * Simulates touch input on a virtual trackpad, used for gesture-based
 * navigation on the Apple TV.
 *
 * @param x - X coordinate on the virtual touchpad.
 * @param y - Y coordinate on the virtual touchpad.
 * @param phase - Touch phase (0=began, 1=moved, 2=ended, etc.).
 * @param finger - Finger index for multi-touch.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendVirtualTouchEvent(x: number, y: number, phase: number, finger: number): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_VIRTUAL_TOUCH_EVENT_MESSAGE);
    const message = create(Proto.SendVirtualTouchEventMessageSchema, {
        virtualDeviceID: 1n,
        event: create(Proto.VirtualTouchEventSchema, {
            x: BigInt(x),
            y: BigInt(y),
            phase,
            finger
        })
    });

    setExtension(protocolMessage, Proto.sendVirtualTouchEventMessage, message);

    return [
        protocolMessage,
        Proto.sendVirtualTouchEventMessage
    ];
}

/**
 * Builds a SEND_HID_EVENT message with a raw USB HID event report.
 *
 * Constructs a binary HID event descriptor with the given usage page, usage,
 * and key state. Used for remote control input (navigation, media keys).
 *
 * @param usePage - HID usage page (e.g. 0x01 for Generic Desktop, 0x0c for Consumer).
 * @param usage - HID usage code within the page.
 * @param down - `true` for key down, `false` for key up.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function sendHIDEvent(usePage: number, usage: number, down: boolean): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_HID_EVENT_MESSAGE);
    const message = create(Proto.SendHIDEventMessageSchema, {
        hidEventData: Buffer.concat([
            Buffer.from('438922cf08020000', 'hex'), // time
            Buffer.from('00000000000000000100000000000000020' + '00000200000000300000001000000000000', 'hex'),
            Buffer.concat([
                uint16ToBE(usePage),
                uint16ToBE(usage),
                uint16ToBE(down ? 1 : 0)
            ]), // data
            Buffer.from('0000000000000001000000', 'hex')
        ])
    });

    setExtension(protocolMessage, Proto.sendHIDEventMessage, message);

    return [
        protocolMessage,
        Proto.sendHIDEventMessage
    ];
}

/**
 * Builds a SET_CONNECTION_STATE message to notify the device of our connection state.
 *
 * @param state - Connection state to report (defaults to Connected).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function setConnectionState(state: Proto.SetConnectionStateMessage_ConnectionState = Proto.SetConnectionStateMessage_ConnectionState.Connected): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_CONNECTION_STATE_MESSAGE);
    const message = create(Proto.SetConnectionStateMessageSchema, {
        state
    });

    setExtension(protocolMessage, Proto.setConnectionStateMessage, message);

    return [
        protocolMessage,
        Proto.setConnectionStateMessage
    ];
}

/**
 * Builds a SET_READY_STATE message to indicate this controller is ready.
 *
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function setReadyState(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_READY_STATE_MESSAGE);
    const message = create(Proto.SetReadyStateMessageSchema, {});

    setExtension(protocolMessage, Proto.readyStateMessage, message);

    return [
        protocolMessage,
        Proto.readyStateMessage
    ];
}

/**
 * Builds a SET_VOLUME message to change the volume of an output device.
 *
 * @param outputDeviceUID - UID of the target output device.
 * @param volume - Volume level to set (typically 0.0 to 1.0).
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function setVolume(outputDeviceUID: string, volume: number): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_VOLUME_MESSAGE);
    const message = create(Proto.SetVolumeMessageSchema, {
        outputDeviceUID,
        volume
    });

    setExtension(protocolMessage, Proto.setVolumeMessage, message);

    return [
        protocolMessage,
        Proto.setVolumeMessage
    ];
}

/**
 * Builds a SET_VOLUME_MUTED message to mute or unmute an output device.
 *
 * @param outputDeviceUID - UID of the target output device.
 * @param isMuted - `true` to mute, `false` to unmute.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function setVolumeMuted(outputDeviceUID: string, isMuted: boolean): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_VOLUME_MUTED_MESSAGE);
    const message = create(Proto.SetVolumeMutedMessageSchema, {
        outputDeviceUID,
        isMuted
    });

    setExtension(protocolMessage, Proto.setVolumeMutedMessage, message);

    return [
        protocolMessage,
        Proto.setVolumeMutedMessage
    ];
}

/**
 * Builds a SET_CONVERSATION_DETECTION_ENABLED message.
 *
 * Enables or disables conversation detection (volume ducking when people
 * are talking) on a HomePod.
 *
 * @param enabled - Whether to enable conversation detection.
 * @param outputDeviceUID - UID of the target output device.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function setConversationDetectionEnabled(enabled: boolean, outputDeviceUID: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_CONVERSATION_DETECTION_ENABLED_MESSAGE);
    const message = create(Proto.SetConversationDetectionEnabledMessageSchema, {
        enabled,
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.setConversationDetectionEnabledMessage, message);

    return [
        protocolMessage,
        Proto.setConversationDetectionEnabledMessage
    ];
}

/**
 * Builds an ADJUST_VOLUME message for relative volume changes.
 *
 * Uses the dedicated AdjustVolumeMessage (extension field 97) for incremental
 * volume adjustments without needing to know the current volume level.
 *
 * @param adjustment - The volume adjustment type (e.g. IncrementSmall, DecrementSmall).
 * @param outputDeviceUID - UID of the target output device.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function adjustVolume(adjustment: Proto.AdjustVolumeMessage_Adjustment, outputDeviceUID: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.ADJUST_VOLUME_MESSAGE);
    const message = create(Proto.AdjustVolumeMessageSchema, {
        adjustment,
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.adjustVolumeMessage, message);

    return [
        protocolMessage,
        Proto.adjustVolumeMessage
    ];
}

/**
 * Builds an AUDIO_FADE message to trigger a cross-fade between audio sources.
 *
 * @param fadeType - The type of audio fade to perform.
 * @param playerPath - Optional player path to target a specific player.
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function audioFade(fadeType: number, playerPath?: Proto.PlayerPath): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.AUDIO_FADE_MESSAGE);
    const message = create(Proto.AudioFadeMessageSchema, {
        fadeType,
        playerPath
    });

    setExtension(protocolMessage, Proto.audioFadeMessage, message);

    return [
        protocolMessage,
        Proto.audioFadeMessage
    ];
}

/**
 * Builds a WAKE_DEVICE message to wake a sleeping Apple TV or HomePod.
 *
 * @returns Tuple of [ProtocolMessage, extension descriptor] for sending via DataStream.
 */
export function wakeDevice(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE);
    const message = create(Proto.WakeDeviceMessageSchema, {});

    setExtension(protocolMessage, Proto.wakeDeviceMessage, message);

    return [
        protocolMessage,
        Proto.wakeDeviceMessage
    ];
}

/**
 * Extracts a typed protobuf extension value from a ProtocolMessage.
 *
 * Convenience re-export of `@bufbuild/protobuf`'s `getExtension` with
 * proper generic typing for use with the Proto extension descriptors.
 *
 * @param message - The ProtocolMessage to extract the extension from.
 * @param extension - The extension descriptor identifying which extension to read.
 * @returns The typed extension value.
 */
export function getExtension<Desc extends DescExtension>(message: Extendee<Desc>, extension: Desc): ExtensionValueShape<Desc> {
    return _getExtension(message, extension);
}
