import { JsonStorage, reporter } from '@basmilius/apple-common';
import { startWebServer } from './web/server';
import { stopSavingLogs } from './logger';

reporter.all();

const port = parseInt(process.argv[2] || '3000');

const storage = new JsonStorage();
await storage.load();

const webServer = await startWebServer(storage, port);

process.on('SIGINT', async () => {
    stopSavingLogs();
    await webServer.stop();
    process.exit(0);
});

process.on('SIGQUIT', async () => {
    stopSavingLogs();
    await webServer.stop();
    process.exit(0);
});
