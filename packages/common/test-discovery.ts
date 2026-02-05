import { Discovery, waitFor } from './src';

const discovery = Discovery.companionLink();

while(true) {
    const result = await discovery.findUntil('Woonkamer-TV.local');

    console.log(result.id, result.service.port);

    await waitFor(3000);
}
