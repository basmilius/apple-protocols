import { randomUUID } from 'node:crypto';
import { create, DescExtension, type Extendee, type ExtensionValueShape, getExtension as _getExtension, setExtension } from '@bufbuild/protobuf';
import type { ResolvedIdentity } from '../identity';
import { uint16ToBE } from '../utils';
import * as Proto from './proto';

/** A ProtocolMessage without extension, with a random `identifier` that the data channel matches replies on. */
export function protocol(type: Proto.ProtocolMessage_Type, errorCode: Proto.ErrorCode_Enum = Proto.ErrorCode_Enum.NoError): Proto.ProtocolMessage {
    return create(Proto.ProtocolMessageSchema, {
        type,
        errorCode,
        identifier: randomUUID().toUpperCase(),
        uniqueIdentifier: randomUUID().toUpperCase()
    });
}

/** Subscribes to state changes. Send early in the session to receive now-playing, volume and artwork updates. */
export function clientUpdatesConfig(artworkUpdates: boolean = true, nowPlayingUpdates: boolean = true, volumeUpdates: boolean = true, keyboardUpdates: boolean = false, outputDeviceUpdates: boolean = false, systemEndpointUpdates: boolean = true, subscribedPlayerPaths: Proto.PlayerPath[] = []): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
    const message = create(Proto.ClientUpdatesConfigMessageSchema, {
        artworkUpdates,
        nowPlayingUpdates,
        volumeUpdates,
        keyboardUpdates,
        outputDeviceUpdates,
        systemEndpointUpdates,
        subscribedPlayerPaths
    });

    setExtension(protocolMessage, Proto.clientUpdatesConfigMessage, message);

    return [
        protocolMessage,
        Proto.clientUpdatesConfigMessage
    ];
}

/** CONFIGURE_CONNECTION, which sets the group ID of this connection. */
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
 * DEVICE_INFO, the first message of a session, which introduces this controller to the receiver.
 *
 * @param pairingId - The pairing identifier from pair-verify.
 */
export function deviceInfo(pairingId: Buffer, identity: ResolvedIdentity): [Proto.ProtocolMessage, DescExtension] {
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
        sharedQueueVersion: 3,
        deviceClass: Proto.DeviceClass_Enum.iPhone,
        logicalDeviceCount: 1,
        modelID: identity.model,
        clusterType: 0,
        isClusterAware: true,
        isGroupLeader: false,
        isProxyGroupPlayer: false,
        groupContainsDiscoverableGroupLeader: 0,
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
 * MODIFY_OUTPUT_CONTEXT_REQUEST, which changes the devices of a multiroom group.
 *
 * @param settingDevices - Replaces the whole output context.
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

/** GET_STATE, which asks for the current playback state. */
export function getState(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_STATE_MESSAGE);
    const message = create(Proto.GetStateMessageSchema, {});

    setExtension(protocolMessage, Proto.getStateMessage, message);

    return [
        protocolMessage,
        Proto.getStateMessage
    ];
}

/** GET_VOLUME, which asks for the volume of an output device. */
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

/** GET_VOLUME_MUTED, which asks whether an output device is muted. */
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

/** NOTIFICATION, which sends a named notification to the receiver. */
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

export type PlaybackQueueAssetOptions = Pick<Proto.PlaybackQueueRequestMessage,
    'contentItemIdentifiers' | 'playerPath' | 'includeAvailableArtworkFormats' |
    'requestedAnimatedArtworkPreviewFrameFormats' | 'requestedAnimatedArtworkAssetURLFormats'>;

/**
 * PLAYBACK_QUEUE_REQUEST, which asks for queue metadata and assets. Animated artwork formats
 * have to be requested explicitly.
 *
 * @param location - Index of the first item.
 * @param artworkWidth - In pixels.
 * @param artworkHeight - In pixels; -1 keeps the aspect ratio.
 */
export function playbackQueueRequest(location: number, length: number, artworkWidth: number = 600, artworkHeight: number = -1, options: Partial<PlaybackQueueAssetOptions> = {}): [Proto.ProtocolMessage, DescExtension] {
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
        includeParticipants: true,
        isLegacyNowPlayingInfoRequest: false,
        // Opt in separately: requesting available formats disables inline artworkData.
        ...options
    });

    setExtension(protocolMessage, Proto.playbackQueueRequestMessage, message);

    return [
        protocolMessage,
        Proto.playbackQueueRequestMessage
    ];
}

/** GET_KEYBOARD_SESSION, which asks whether a text field is active; the answer is a KEYBOARD message. */
export function getKeyboardSession(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_KEYBOARD_SESSION_MESSAGE);

    setExtension(protocolMessage, Proto.getKeyboardSessionMessage, '');

    return [
        protocolMessage,
        Proto.getKeyboardSessionMessage
    ];
}

/** Requests an RTI session; the receiver supplies a RemoteTextInputMessage. */
export function getRemoteTextInputSession(): [Proto.ProtocolMessage, DescExtension] {
    const message = protocol(Proto.ProtocolMessage_Type.GET_REMOTE_TEXT_INPUT_SESSION_MESSAGE);
    setExtension(message, Proto.getRemoteTextInputSessionMessage, create(Proto.GetRemoteTextInputSessionMessageSchema));

    return [message, Proto.getRemoteTextInputSessionMessage];
}

/**
 * REMOTE_TEXT_INPUT, which carries one RTI text operation.
 *
 * @param data - The archived RTI operation.
 * @param version - The version of the RTI session it edits.
 */
export function remoteTextInput(data: Uint8Array, version: bigint = 1n): [Proto.ProtocolMessage, DescExtension] {
    const message = protocol(Proto.ProtocolMessage_Type.REMOTE_TEXT_INPUT_MESSAGE);
    setExtension(message, Proto.remoteTextInputMessage, create(Proto.RemoteTextInputMessageSchema, {version, data}));

    return [message, Proto.remoteTextInputMessage];
}

/**
 * TEXT_INPUT, which sends text to the active keyboard session.
 *
 * @param actionType - For example done, search or send.
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
 * SEND_BUTTON_EVENT, a USB HID button press or release.
 *
 * @param usagePage - For example 0x01 for Generic Desktop, 0x0c for Consumer.
 * @param buttonDown - `true` for key down, `false` for key up.
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

/** @param skipInterval - Seconds. */
export function sendCommandWithSkipInterval(command: Proto.Command, skipInterval: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { skipInterval }));
}

/** @param playbackPosition - Seconds from the start. */
export function sendCommandWithPlaybackPosition(command: Proto.Command, playbackPosition: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackPosition }));
}

/** @param playbackRate - 1 is normal speed, 2 is double speed. */
export function sendCommandWithPlaybackRate(command: Proto.Command, playbackRate: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackRate }));
}

export function sendCommandWithShuffleMode(command: Proto.Command, shuffleMode: Proto.ShuffleMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { shuffleMode }));
}

export function sendCommandWithRepeatMode(command: Proto.Command, repeatMode: Proto.RepeatMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { repeatMode }));
}

/** SEND_COMMAND, a playback command such as play, pause or next track. */
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
 * A Pause command that carries a sleep timer.
 *
 * @param seconds - Timer duration; 0 cancels a running timer.
 * @param stopMode - 0 stops playback, 1 pauses, 2 waits for the end of the track, 3 for the end of the queue.
 */
export function sendCommandWithSleepTimer(seconds: number, stopMode: number = 0): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(Proto.Command.Pause, create(Proto.CommandOptionsSchema, {
        sleepTimerTime: BigInt(seconds),
        sleepTimerStopMode: stopMode
    }));
}

/**
 * REGISTER_HID_DEVICE, which claims a virtual touch device. The Apple TV answers with a
 * REGISTER_HID_DEVICE_RESULT that holds the device identifier {@link sendVirtualTouchEvent} has
 * to carry; an unclaimed identifier makes it drop the session.
 *
 * @param absolute - Whether coordinates are absolute positions instead of relative movement.
 * @param integratedDisplay - Whether the surface sits on top of a display, as on a phone.
 */
export function registerHIDDevice(screenWidth: number = 1000, screenHeight: number = 1000, absolute: boolean = true, integratedDisplay: boolean = false): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.REGISTER_HID_DEVICE_MESSAGE);
    const message = create(Proto.RegisterHIDDeviceMessageSchema, {
        deviceDescriptor: create(Proto.VirtualTouchDeviceDescriptorSchema, {
            absolute,
            integratedDisplay,
            screenSizeWidth: screenWidth,
            screenSizeHeight: screenHeight
        })
    });

    setExtension(protocolMessage, Proto.registerHIDDeviceMessage, message);

    return [
        protocolMessage,
        Proto.registerHIDDeviceMessage
    ];
}

/**
 * SEND_PACKED_VIRTUAL_TOUCH_EVENT, the packed form of a touch event: the five values as 16-bit
 * little endian integers in one byte array, in the order x, y, phase, device identifier, finger.
 *
 * @param phase - 1 began, 2 moved, 3 stationary, 4 ended, 5 cancelled.
 * @param deviceId - The identifier {@link registerHIDDevice} handed out.
 * @param finger - Finger index for multi-touch.
 */
export function sendPackedVirtualTouchEvent(x: number, y: number, phase: number, deviceId: number, finger: number): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_PACKED_VIRTUAL_TOUCH_EVENT_MESSAGE);
    const data = Buffer.alloc(10);

    data.writeUInt16LE(x, 0);
    data.writeUInt16LE(y, 2);
    data.writeUInt16LE(phase, 4);
    data.writeUInt16LE(deviceId, 6);
    data.writeUInt16LE(finger, 8);

    const message = create(Proto.SendPackedVirtualTouchEventMessageSchema, {data});

    setExtension(protocolMessage, Proto.sendPackedVirtualTouchEventMessage, message);

    return [
        protocolMessage,
        Proto.sendPackedVirtualTouchEventMessage
    ];
}

/**
 * SEND_VIRTUAL_TOUCH_EVENT, a touch on the virtual touchpad of {@link registerHIDDevice}.
 *
 * @param phase - 1 began, 2 moved, 3 stationary, 4 ended, 5 cancelled.
 * @param finger - Finger index for multi-touch.
 * @param deviceId - The identifier {@link registerHIDDevice} handed out.
 */
export function sendVirtualTouchEvent(x: number, y: number, phase: number, finger: number, deviceId: number = 1): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_VIRTUAL_TOUCH_EVENT_MESSAGE);
    const message = create(Proto.SendVirtualTouchEventMessageSchema, {
        virtualDeviceID: BigInt(deviceId),
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
 * SEND_HID_EVENT, a raw USB HID event report for a navigation or media key.
 *
 * @param usePage - For example 0x01 for Generic Desktop, 0x0c for Consumer.
 * @param down - `true` for key down, `false` for key up.
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

/** SET_CONNECTION_STATE, which tells the receiver our connection state. */
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

/** SET_READY_STATE, which tells the receiver this controller is ready. */
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
 * SET_VOLUME, which sets the volume of an output device.
 *
 * @param volume - 0 to 1.
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

/** SET_VOLUME_MUTED, which mutes or unmutes an output device. */
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

/** SET_CONVERSATION_DETECTION_ENABLED, which turns conversation detection of a HomePod on or off: it ducks the volume while people talk. */
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
 * ADJUST_VOLUME (extension field 97), a relative volume step that needs no current volume.
 *
 * @param adjustment - For example IncrementSmall or DecrementSmall.
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
 * AUDIO_FADE, which asks the receiver to fade its audio.
 *
 * @param fadeType - 0 fades out, 1 fades in.
 * @param playerPath - Targets one player instead of the active one.
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
 * SET_LISTENING_MODE, which sets the listening mode of a HomePod.
 *
 * @param listeningMode - For example `Default`, `Vivid` or `LateNight`.
 */
export function setListeningMode(listeningMode: string, outputDeviceUID: string): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_LISTENING_MODE_MESSAGE);
    const message = create(Proto.SetListeningModeMessageSchema, {
        listeningMode,
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.setListeningModeMessage, message);

    return [
        protocolMessage,
        Proto.setListeningModeMessage
    ];
}

/** SET_DISCOVERY_MODE, which turns device discovery on or off. */
export function setDiscoveryMode(mode: number): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_DISCOVERY_MODE_MESSAGE);
    const message = create(Proto.SetDiscoveryModeMessageSchema, {
        mode
    });

    setExtension(protocolMessage, Proto.setDiscoveryModeMessage, message);

    return [
        protocolMessage,
        Proto.setDiscoveryModeMessage
    ];
}

/** REQUEST_GROUP_SESSION, which starts a SharePlay group session. */
export function requestGroupSession(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.REQUEST_GROUP_SESSION_MESSAGE);
    const message = create(Proto.RequestGroupSessionMessageSchema, {});

    setExtension(protocolMessage, Proto.requestGroupSessionMessage, message);

    return [
        protocolMessage,
        Proto.requestGroupSessionMessage
    ];
}

/** PLAYBACK_SESSION_MIGRATE_BEGIN, which starts moving playback to another device. */
export function playbackSessionMigrateBegin(playerPath?: Proto.PlayerPath): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_BEGIN_MESSAGE);
    const message = create(Proto.PlaybackSessionMigrateBeginMessageSchema, {
        playerPath
    });

    setExtension(protocolMessage, Proto.playbackSessionMigrateBeginMessage, message);

    return [
        protocolMessage,
        Proto.playbackSessionMigrateBeginMessage
    ];
}

/** PLAYBACK_SESSION_MIGRATE_END, which completes moving playback to another device. */
export function playbackSessionMigrateEnd(playerPath?: Proto.PlayerPath): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.PLAYBACK_SESSION_MIGRATE_END_MESSAGE);
    const message = create(Proto.PlaybackSessionMigrateEndMessageSchema, {
        playerPath
    });

    setExtension(protocolMessage, Proto.playbackSessionMigrateEndMessage, message);

    return [
        protocolMessage,
        Proto.playbackSessionMigrateEndMessage
    ];
}

/** WAKE_DEVICE, which wakes a sleeping Apple TV or HomePod. */
export function wakeDevice(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE);
    const message = create(Proto.WakeDeviceMessageSchema, {});

    setExtension(protocolMessage, Proto.wakeDeviceMessage, message);

    return [
        protocolMessage,
        Proto.wakeDeviceMessage
    ];
}

/** Reads a protobuf extension of a ProtocolMessage, typed by its descriptor. */
export function getExtension<Desc extends DescExtension>(message: Extendee<Desc>, extension: Desc): ExtensionValueShape<Desc> {
    return _getExtension(message, extension);
}
