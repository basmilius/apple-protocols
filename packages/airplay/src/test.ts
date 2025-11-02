import { Discovery } from '@basmilius/apple-common';
import { AirPlay } from '@/protocol';

const discovery = Discovery.airplay();
const device = await discovery.findUntil('Slaapkamer HomePod._airplay._tcp.local');

const protocol = new AirPlay(device);
await protocol.connect();

// const info = await protocol.rtsp.get('/info');
// const raw = await info.blob();
// const plist = parseBinaryPlist(await raw.arrayBuffer());
//
// console.log(plist);

await protocol.pairing.start();
const keys = await protocol.pairing.transient();
console.log(keys);

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
