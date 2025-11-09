import { Discovery, enableDebug } from '@basmilius/apple-common';
import { AppleTV } from './model';

enableDebug();

const credentials = {
    accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
    accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
    pairingId: Buffer.from('46363138303243462d334134302d343045362d394231392d423835453530323042463534', 'hex'),
    publicKey: Buffer.from('b12ef596d615e040f43675020e73a52c375d7fcecc2d10c4a342694eeb01d87a', 'hex'),
    secretKey: Buffer.from('1abbb7a03b1ff46702fc3f95b2a0b5e83bbf4a730927f88ba2975ce10fb0c7e0b12ef596d615e040f43675020e73a52c375d7fcecc2d10c4a342694eeb01d87a', 'hex')
};

const airplayDiscovery = Discovery.airplay();
const airplayDiscoveryResult = await airplayDiscovery.findUntil('Woonkamer TV._airplay._tcp.local');
const companionLinkDiscovery = Discovery.companionLink();
const companionLinkDiscoveryResult = await companionLinkDiscovery.findUntil('Woonkamer TV._companion-link._tcp.local');

const device = new AppleTV(airplayDiscoveryResult, companionLinkDiscoveryResult);
await device.connect(credentials);

// await device.turnOn();
// await device.companionLink.pressButton('Select');
