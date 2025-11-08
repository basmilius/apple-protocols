import { uuid } from '@basmilius/apple-common';
import { create, setExtension } from '@bufbuild/protobuf';
import * as Proto from '@/proto';

export default class {
    clientUpdatesConfig(): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
        const message = create(Proto.ClientUpdatesConfigMessageSchema, {
            artworkUpdates: true,
            nowPlayingUpdates: false,
            volumeUpdates: true,
            keyboardUpdates: false,
            outputDeviceUpdates: true
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
            systemBuildVersion: '23B82',
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
            deviceClass: 1,
            logicalDeviceCount: 1
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
}
