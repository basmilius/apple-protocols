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

export function clientUpdatesConfig(artworkUpdates: boolean = true, nowPlayingUpdates: boolean = true, volumeUpdates: boolean = true, keyboardUpdates: boolean = false, outputDeviceUpdates: boolean = true): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
    const message = create(Proto.ClientUpdatesConfigMessageSchema, {
        artworkUpdates,
        nowPlayingUpdates,
        volumeUpdates,
        keyboardUpdates,
        outputDeviceUpdates,
        Unknown1: false
    });

    setExtension(protocolMessage, Proto.clientUpdatesConfigMessage, message);

    return protocolMessage;
}

export function configureConnection(groupId: string): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE);
    const message = create(Proto.ConfigureConnectionMessageSchema, {
        groupID: groupId
    });

    setExtension(protocolMessage, Proto.configureConnectionMessage, message);

    return protocolMessage;
}

export function deviceInfo(pairingId: Buffer): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE);
    const message = create(Proto.DeviceInfoMessageSchema, {
        uniqueIdentifier: pairingId.toString(),
        name: 'iPhone van Bas',
        localizedModelName: 'iPhone',
        systemBuildVersion: '18C66',
        applicationBundleIdentifier: 'com.apple.TVRemote',
        applicationBundleVersion: '344.28',
        protocolVersion: 1,
        lastSupportedMessageType: 108,
        supportsSystemPairing: true,
        allowsPairing: true,
        systemMediaApplication: 'com.apple.TVMusic',
        supportsACL: true,
        supportsSharedQueue: true,
        supportsExtendedMotion: true,
        sharedQueueVersion: 2,
        deviceClass: Proto.DeviceClass_Enum.iPhone,
        logicalDeviceCount: 1,
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

    return protocolMessage;
}

export function getState(): Proto.ProtocolMessage {
    return protocol(Proto.ProtocolMessage_Type.GET_STATE_MESSAGE);
}

export function getVolume(outputDeviceUID: string): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.GET_VOLUME_MESSAGE);
    const message = create(Proto.GetVolumeMessageSchema, {
        outputDeviceUID
    });

    setExtension(protocolMessage, Proto.getVolumeMessage, message);

    return protocolMessage;
}

export function playbackQueueRequest(location: number, length: number, includeMetadata: boolean = true, includeLanguageOptions: boolean = true): Proto.ProtocolMessage {
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
        returnContentItemAssetsInUserCompletion: true
    });

    setExtension(protocolMessage, Proto.playbackQueueRequestMessage, message);

    return protocolMessage;
}

export function sendButtonEvent(usagePage: number, usage: number, buttonDown: boolean): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_BUTTON_EVENT_MESSAGE);
    const message = create(Proto.SendButtonEventMessageSchema, {
        usagePage,
        usage,
        buttonDown
    });

    setExtension(protocolMessage, Proto.sendButtonEventMessage, message);

    return protocolMessage;
}

export function sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SEND_COMMAND_MESSAGE);
    const message = create(Proto.SendCommandMessageSchema, {
        command,
        options
    });

    setExtension(protocolMessage, Proto.sendCommandMessage, message);

    return protocolMessage;
}

export function sendHIDEvent(usePage: number, usage: number, down: boolean): Proto.ProtocolMessage {
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

    return protocolMessage;
}

export function setConnectionState(state: Proto.SetConnectionStateMessage_ConnectionState = Proto.SetConnectionStateMessage_ConnectionState.Connected): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_CONNECTION_STATE_MESSAGE);
    const message = create(Proto.SetConnectionStateMessageSchema, {
        state
    });

    setExtension(protocolMessage, Proto.setConnectionStateMessage, message);

    return protocolMessage;
}

export function setVolume(outputDeviceUID: string, volume: number): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.SET_VOLUME_MESSAGE);
    const message = create(Proto.SetVolumeMessageSchema, {
        outputDeviceUID,
        volume
    });

    setExtension(protocolMessage, Proto.setVolumeMessage, message);

    return protocolMessage;
}

export function wakeDevice(): Proto.ProtocolMessage {
    const protocolMessage = protocol(Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE);
    const message = create(Proto.WakeDeviceMessageSchema, {});

    setExtension(protocolMessage, Proto.wakeDeviceMessage, message);

    return protocolMessage;
}

export function getExtension<Desc extends DescExtension>(message: Extendee<Desc>, extension: Desc): ExtensionValueShape<Desc> {
    return _getExtension(message, extension);
}
