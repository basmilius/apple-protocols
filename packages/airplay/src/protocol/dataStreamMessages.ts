import { create, setExtension } from '@bufbuild/protobuf';
import * as Proto from '@/proto';
import { uuid } from '@basmilius/apple-common';

export default class {
    clientUpdatesConfig(): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.CLIENT_UPDATES_CONFIG_MESSAGE);
        const message = create(Proto.ClientUpdatesConfigMessageSchema, {
            artworkUpdates: true,
            nowPlayingUpdates: true,
            volumeUpdates: true,
            keyboardUpdates: true,
            outputDeviceUpdates: true
        });

        setExtension(protocolMessage, Proto.clientUpdatesConfigMessage, message);

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

    protocol(type: Proto.ProtocolMessage_Type, errorCode: Proto.ErrorCode_Enum = Proto.ErrorCode_Enum.NoError): Proto.ProtocolMessage {
        return create(Proto.ProtocolMessageSchema, {
            type,
            errorCode,
            identifier: uuid().toUpperCase(),
            uniqueIdentifier: uuid().toUpperCase()
        });
    }

    setConnectionState(state: Proto.SetConnectionStateMessage_ConnectionState = Proto.SetConnectionStateMessage_ConnectionState.Connected): Proto.ProtocolMessage {
        const protocolMessage = this.protocol(Proto.ProtocolMessage_Type.SET_CONNECTION_STATE_MESSAGE);
        const message = create(Proto.SetConnectionStateMessageSchema, {
            state
        });

        setExtension(protocolMessage, Proto.setConnectionStateMessage, message);

        return protocolMessage;
    }
}
