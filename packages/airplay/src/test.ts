import { Discovery, uuid } from '@basmilius/apple-common';
import { AirPlay } from '@/protocol';
import { deviceInfoMessage, DeviceInfoMessageSchema } from '@/proto/DeviceInfoMessage_pb';
import { ErrorCode_Enum, ProtocolMessage_Type, ProtocolMessageSchema } from '@/proto/ProtocolMessage_pb';
import { create, setExtension } from '@bufbuild/protobuf';

const discovery = Discovery.airplay();
// const device = await discovery.findUntil('Woonkamer HomePod (3)._airplay._tcp.local');

// const protocol = new AirPlay(device);
const protocol = new AirPlay({address: '192.168.1.195', service: {port: 7000}} as any);
await protocol.connect();

await protocol.pairing.start();
const keys = await protocol.pairing.transient();

await protocol.rtsp.enableEncryption(
    keys.accessoryToControllerKey,
    keys.controllerToAccessoryKey
);

await protocol.setupEventStream(keys.pairingId, keys.sharedSecret);
await protocol.setupDataStream(keys.sharedSecret);

// setInterval(() => protocol.feedback(), 2000);

// await protocol.dataStream.sendProto(ConfigureConnectionMessageSchema, {
//     groupID: '7121A067-38A0-4638-B777-1B8C45B9700C+F78E5A0E-39ED-441E-8F81-80B0944D6491'
// });

/*
import { ProtocolMessage, ProtocolMessage_Type } from './gen/protocol_pb';
import { deviceInfoMessage } from './gen/device_info_pb';
import { create, toBinary } from '@bufbuild/protobuf';

// 1. Create the inner DeviceInfoMessage
const deviceInfo = create(deviceInfoMessage.type, {});

// 2. Create the ProtocolMessage wrapper and attach the extension
const protocolMsg = create(ProtocolMessage, {
  type: ProtocolMessage_Type.DEVICE_INFO_MESSAGE,
  uniqueIdentifier: deviceInfo.uniqueIdentifier,
});
deviceInfoMessage.set(protocolMsg, deviceInfo); // attach DeviceInfoMessage as extension

// 3. Serialize as usual
const bytes = toBinary(protocolMsg);
 */

deviceInfoMessage.extendee

const deviceInfo = create(DeviceInfoMessageSchema, {
    uniqueIdentifier: keys.pairingId.toString(),
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

const protocolMessage = create(ProtocolMessageSchema, {
    type: ProtocolMessage_Type.DEVICE_INFO_MESSAGE,
    errorCode: ErrorCode_Enum.NoError,
    identifier: uuid().toUpperCase()
});

setExtension(protocolMessage, deviceInfoMessage, deviceInfo);

await protocol.dataStream.sendProtoRaw(ProtocolMessageSchema, protocolMessage);

// await protocol.dataStream.sendProto(DeviceInfoMessageSchema, {
//     uniqueIdentifier: keys.pairingId.toString(),
//     name: 'iPhone van Bas',
//     localizedModelName: 'iPhone',
//     systemBuildVersion: '23B82',
//     applicationBundleIdentifier: 'com.apple.TVRemote',
//     applicationBundleVersion: '344.28',
//     protocolVersion: 1,
//     lastSupportedMessageType: 108,
//     supportsSystemPairing: true,
//     allowsPairing: true,
//     systemMediaApplication: 'com.apple.TVMusic',
//     supportsACL: true,
//     supportsSharedQueue: true,
//     supportsExtendedMotion: true,
//     sharedQueueVersion: 2,
//     deviceClass: 1,
//     logicalDeviceCount: 1
// });

// const info = await protocol.rtsp.get('/info');
// const raw = await info.blob();
// const plist = parseBinaryPlist(await raw.arrayBuffer());
//
// console.log(plist);

// await protocol.pairing.start();
// const credentials = await protocol.pairing.pin(async () => await prompt('Enter PIN'));
//
// console.log({
//     accessoryIdentifier: credentials.accessoryIdentifier,
//     accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
//     pairingId: credentials.pairingId.toString('hex'),
//     publicKey: credentials.publicKey.toString('hex'),
//     secretKey: credentials.secretKey.toString('hex')
// });

// const credentials = {
//     accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
//     accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
//     pairingId: Buffer.from('41454134374231382d353539412d343333452d413944302d343637433841334638414133', 'hex'),
//     publicKey: Buffer.from('56611a22c1ad2070760a8cb42ff6c4633087647b02b5aeec792242b32d87608b', 'hex'),
//     secretKey: Buffer.from('e6ea30fc7823bb698b3f9c39481c30f822de6684f3795d70e7d10a44fa4279ab56611a22c1ad2070760a8cb42ff6c4633087647b02b5aeec792242b32d87608b', 'hex')
// };
//
// const keys = await protocol.verify.start(credentials);
//
// console.log(keys);
