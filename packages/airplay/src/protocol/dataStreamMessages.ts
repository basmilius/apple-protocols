import { uint16ToBE, uuid } from '@basmilius/apple-common';
import { create, setExtension } from '@bufbuild/protobuf';
import * as Proto from '../proto';

export default class {
    clientUpdatesConfig(): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
        const message = create(Proto.ClientUpdatesConfigMessageSchema, {
            artworkUpdates: true,
            nowPlayingUpdates: true,
            volumeUpdates: true,
            keyboardUpdates: false,
            outputDeviceUpdates: true,
            Unknown1: false
        });

        setExtension(protocolMessage, Proto.clientUpdatesConfigMessage, message);

        return protocolMessage;
    }

    configureConnection(groupId: string): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.CONFIGURE_CONNECTION_MESSAGE);
        const message = create(Proto.ConfigureConnectionMessageSchema, {
            groupID: groupId
        });

        setExtension(protocolMessage, Proto.configureConnectionMessage, message);

        return protocolMessage;
    }

    deviceInfo(pairingId: Buffer): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.DEVICE_INFO_MESSAGE);
        const message = create(Proto.DeviceInfoMessageSchema, {
            uniqueIdentifier: pairingId.toString(),
            name: 'iPhone van Bas',
            localizedModelName: 'iPhone',
            systemBuildVersion: '23C5027f',
            applicationBundleIdentifier: 'com.apple.mediaremoted',
            protocolVersion: 1,
            lastSupportedMessageType: 139,
            supportsSystemPairing: true,
            allowsPairing: true,
            systemMediaApplication: 'com.apple.Music',
            supportsACL: true,
            supportsSharedQueue: true,
            sharedQueueVersion: 3,
            managedConfigDeviceID: 'c4:c1:7d:93:d2:13',
            deviceClass: Proto.DeviceClass_Enum.iPhone,
            logicalDeviceCount: 1,
            isProxyGroupPlayer: false,
            groupUID: uuid().toUpperCase(),
            isGroupLeader: true,
            isAirplayActive: false,
            systemPodcastApplication: 'com.apple.podcasts',
            senderDefaultGroupUID: uuid().toUpperCase(),
            clusterType: 0,
            isClusterAware: true,
            modelID: 'iPhone16,2',
            supportsMultiplayer: false,
            routingContextID: uuid().toUpperCase(),
            airPlayGroupID: uuid().toUpperCase(),
            systemBooksApplication: 'com.apple.iBooks',
            parentGroupContainsDiscoverableGroupLeader: 1,
            groupContainsDiscoverableGroupLeader: 1,
            lastKnownClusterType: 2,
            supportsOutputContextSync: true,
            computerName: 'iPhone van Bas',
            configuredClusterSize: 0
            // applicationBundleVersion: '344.28',
            // supportsExtendedMotion: true
        });

        setExtension(protocolMessage, Proto.deviceInfoMessage, message);

        return protocolMessage;
    }

    notification(notification: string[]): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.NOTIFICATION_MESSAGE);
        const message = create(Proto.NotificationMessageSchema, {
            notification
        });

        setExtension(protocolMessage, Proto.notificationMessage, message);

        return protocolMessage;
    }

    playbackQueueRequest(location: number, length: number, includeMetadata: boolean = true, includeLanguageOptions: boolean = true): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.PLAYBACK_QUEUE_REQUEST_MESSAGE);
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

    protocol(type: Proto.ProtocolMessage_Type, errorCode: Proto.ErrorCode_Enum = Proto.ErrorCode_Enum.NoError): Proto.ProtocolMessage {
        return create(Proto.ProtocolMessageSchema, {
            type,
            errorCode,
            identifier: uuid().toUpperCase(),
            uniqueIdentifier: uuid().toUpperCase()
        });
    }

    sendButtonEvent(usagePage: number, usage: number, buttonDown: boolean): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SEND_BUTTON_EVENT_MESSAGE);
        const message = create(Proto.SendButtonEventMessageSchema, {
            usagePage,
            usage,
            buttonDown
        });

        setExtension(protocolMessage, Proto.sendButtonEventMessage, message);

        return protocolMessage;
    }

    sendCommand(command: Proto.Command, options?: Proto.CommandOptions): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SEND_COMMAND_MESSAGE);
        const message = create(Proto.SendCommandMessageSchema, {
            command,
            options
        });

        setExtension(protocolMessage, Proto.sendCommandMessage, message);

        return protocolMessage;
    }

    sendHIDEvent(usePage: number, usage: number, down: boolean): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SEND_HID_EVENT_MESSAGE);
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

    setConnectionState(state: Proto.SetConnectionStateMessage_ConnectionState = Proto.SetConnectionStateMessage_ConnectionState.Connected): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SET_CONNECTION_STATE_MESSAGE);
        const message = create(Proto.SetConnectionStateMessageSchema, {
            state
        });

        setExtension(protocolMessage, Proto.setConnectionStateMessage, message);

        return protocolMessage;
    }

    setVolume(volume: number): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SET_VOLUME_MESSAGE);
        const message = create(Proto.SetVolumeMessageSchema, {
            volume
        });

        setExtension(protocolMessage, Proto.setVolumeMessage, message);

        return protocolMessage;
    }

    wakeDevice(): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.WAKE_DEVICE_MESSAGE);
        const message = create(Proto.WakeDeviceMessageSchema, {});

        setExtension(protocolMessage, Proto.wakeDeviceMessage, message);

        return protocolMessage;
    }
}
