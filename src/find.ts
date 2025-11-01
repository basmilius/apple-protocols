import { Discovery } from '@/discovery';
import { waitFor } from '@/cli';

const discovery = Discovery.companionLink();

while (true) {
    const devices = await discovery.find();

    console.log();
    console.log(devices.map(d => ` ● ${d.fqdn}`).join('\n'));

    await waitFor(10_000);
}
