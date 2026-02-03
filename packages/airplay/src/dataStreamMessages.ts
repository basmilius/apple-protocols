import { uint16ToBE, uuid } from '@basmilius/apple-common';
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

export function deviceInfo(pairingId: Buffer): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE);
    const message = create(Proto.DeviceInfoMessageSchema, {
        uniqueIdentifier: pairingId.toString(),
        name: 'iPhone van Bas',
        localizedModelName: 'iPhone',
        systemBuildVersion: '18C66',
        applicationBundleIdentifier: 'com.apple.TVRemote',
        applicationBundleVersion: '344.28',
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
        logicalDeviceCount: 1
        // managedConfigDeviceID: 'c4:c1:7d:93:d2:13',
        // isProxyGroupPlayer: false,
        // groupUID: uuid().toUpperCase(),
        // isGroupLeader: true,
        // isAirplayActive: false,
        // systemPodcastApplication: 'com.apple.podcasts',
        // senderDefaultGroupUID: uuid().toUpperCase(),
        // clusterType: 0,
        // isClusterAware: true,
        // modelID: 'iPhone16,2',
        // supportsMultiplayer: false,
        // routingContextID: uuid().toUpperCase(),
        // airPlayGroupID: uuid().toUpperCase(),
        // systemBooksApplication: 'com.apple.iBooks',
        // parentGroupContainsDiscoverableGroupLeader: 1,
        // groupContainsDiscoverableGroupLeader: 1,
        // lastKnownClusterType: 2,
        // supportsOutputContextSync: true,
        // computerName: 'iPhone van Bas',
        // configuredClusterSize: 0
    });

    setExtension(protocolMessage, Proto.deviceInfoMessage, message);

    return [
        protocolMessage,
        Proto.deviceInfoMessage
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

export function playbackQueueRequest(location: number, length: number, includeMetadata: boolean = true, includeLanguageOptions: boolean = false): [Proto.ProtocolMessage, DescExtension] {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.PLAYBACK_QUEUE_REQUEST_MESSAGE);
    const message = create(Proto.PlaybackQueueRequestMessageSchema, {
        location,
        length,
        includeMetadata,
        includeLanguageOptions,
        artworkHeight: 600,
        artworkWidth: 600,
        includeInfo: true,
        includeLyrics: true,
        includeSections: true,
        includeAlignments: true,
        includeAvailableArtworkFormats: true,
        includeParticipants: true,
        isLegacyNowPlayingInfoRequest: false
    });

    setExtension(protocolMessage, Proto.playbackQueueRequestMessage, message);

    return [
        protocolMessage,
        Proto.playbackQueueRequestMessage
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
