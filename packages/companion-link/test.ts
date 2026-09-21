import { Discovery, prompt, reporter } from '@basmilius/apple-common';
import * as CompanionLink from './src';

reporter.all();

const discovery = Discovery.companionLink();
const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');

const protocol = new CompanionLink.Protocol(discoveryResult);
await protocol.connect();

async function pair(): Promise<void> {
    await protocol.pairing.start();
    const credentials = await protocol.pairing.pin(async () => await prompt('Enter PIN'));

    console.log({
        accessoryIdentifier: credentials.accessoryIdentifier,
        accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
        pairingId: credentials.pairingId.toString('hex'),
        publicKey: credentials.publicKey.toString('hex'),
        secretKey: credentials.secretKey.toString('hex')
    });
}

async function verify(): Promise<void> {
    const credentials = {
        accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
        accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
        pairingId: Buffer.from('37313431424134412d344632452d343830352d423146302d303734464644363045344236', 'hex'),
        publicKey: Buffer.from('0b920552a12f22dc420783f07d3a218e77c56d1380b0debe29c115ff5f4d7366', 'hex'),
        secretKey: Buffer.from('c08b835bface415099acd56e227fc13c4155c8fea81450086c9745a5a296cf750b920552a12f22dc420783f07d3a218e77c56d1380b0debe29c115ff5f4d7366', 'hex')
    };

    const keys = await protocol.verify.start(credentials);

    protocol.stream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.systemInfo(credentials.pairingId);
    await protocol.sessionStart();
    await protocol.tvrcSessionStart();
    await protocol.touchStart();
    await protocol.tiStart();

    await protocol.unsubscribe('_iMC');
    await protocol.subscribe('SystemStatus', evt => console.debug('SystemStatus', evt));
    await protocol.subscribe('TVSystemStatus', evt => console.debug('TVSystemStatus', evt));

}

await verify();
