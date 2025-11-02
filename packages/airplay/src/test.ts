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
