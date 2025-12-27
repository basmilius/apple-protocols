import { styleText } from 'node:util';
import { Discovery, waitFor } from '@basmilius/apple-common';

const discovery = Discovery.airplay();

while (true) {
    const devices = await discovery.find();

    if (devices.length === 0) {
        console.log();
        console.log(`${styleText('red', '!')} No devices found.`);
    } else {
        console.log();
        console.log(devices.map(d => `${styleText('green', '❱')} ${d.fqdn} (${d.address}:${d.service.port})`).join('\n'));
    }

    console.log();
    console.log(styleText('cyan', 'Updating in 10 seconds...'));

    await waitFor(10_000);
}
