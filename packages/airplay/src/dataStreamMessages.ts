import { type DeviceIdentity, uint16ToBE, uuid } from '@basmilius/apple-common';
import { create, DescExtension, type Extendee, type ExtensionValueShape, getExtension as _getExtension, setExtension } from '@bufbuild/protobuf';
import * as Proto from './proto';

export function protocol(type: Proto.ProtocolMessage_Type, errorCode: Proto.ErrorCode_Enum = Proto.ErrorCode_Enum.NoError): Proto.ProtocolMessage {
    return create(Proto.ProtocolMessageSchema, {
        type,
        errorCode,
        identifier: uuid().toUpperCase(),
        uniqueIdentifier: uuid().toUpperCase()
    });
}

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
        lastSupportedMessageType: 129,
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

export function modifyOutputContext(addingDevices: string[] = [], removingDevices: string[] = [], settingDevices: string[] = []): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
    const message = create(Proto.ModifyOutputContextRequestMessageSchema, {
        type: Proto.ModifyOutputContextRequestType_Enum.SharedAudioPresentation,
        addingDevices,
        removingDevices,
        settingDevices,
        clusterAwareAddingDevices: addingDevices,
        clusterAwareRemovingDevices: removingDevices,
        clusterAwareSettingDevices: settingDevices
    });

    setExtension(protocolMessage, Proto.modifyOutputContextRequestMessage, message);

    return [
        protocolMessage,
        Proto.modifyOutputContextRequestMessage
    ];
}

export function getState(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_STATE_MESSAGE);
    const message = create(Proto.GetStateMessageSchema, {});

    setExtension(protocolMessage, Proto.getStateMessage, message);

    return [
        protocolMessage,
        Proto.getStateMessage
    ];
}

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

export function getKeyboardSession(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_KEYBOARD_SESSION_MESSAGE);

    setExtension(protocolMessage, Proto.getKeyboardSessionMessage, '');

    return [
        protocolMessage,
        Proto.getKeyboardSessionMessage
    ];
}

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

export function sendCommandWithSkipInterval(command: Proto.Command, skipInterval: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { skipInterval }));
}

export function sendCommandWithPlaybackPosition(command: Proto.Command, playbackPosition: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackPosition }));
}

export function sendCommandWithPlaybackRate(command: Proto.Command, playbackRate: number): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { playbackRate }));
}

export function sendCommandWithShuffleMode(command: Proto.Command, shuffleMode: Proto.ShuffleMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { shuffleMode }));
}

export function sendCommandWithRepeatMode(command: Proto.Command, repeatMode: Proto.RepeatMode_Enum): [Proto.ProtocolMessage, DescExtension] {
    return sendCommand(command, create(Proto.CommandOptionsSchema, { repeatMode }));
}

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

export function setReadyState(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_READY_STATE_MESSAGE);
    const message = create(Proto.SetReadyStateMessageSchema, {});

    setExtension(protocolMessage, Proto.readyStateMessage, message);

    return [
        protocolMessage,
        Proto.readyStateMessage
    ];
}

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

export function wakeDevice(): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE);
    const message = create(Proto.WakeDeviceMessageSchema, {});

    setExtension(protocolMessage, Proto.wakeDeviceMessage, message);

    return [
        protocolMessage,
        Proto.wakeDeviceMessage
    ];
}

export function getExtension<Desc extends DescExtension>(message: Extendee<Desc>, extension: Desc): ExtensionValueShape<Desc> {
    return _getExtension(message, extension);
}
