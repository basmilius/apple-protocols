import { JsonStorage, reporter } from '@basmilius/apple-common';
import { prompt } from 'enquirer';

import { stopSavingLogs } from './logger';
import airplayListen from './airplayListen';
import airplayMonitor from './airplayMonitor';
import airplayPlayUrl from './airplayPlayUrl';
import airplayStreamAudio from './airplayStreamAudio';
import airplayPair from './airplayPair';
import companionLinkPair from './companionLinkPair';
import appleTvAirPlayVerify from './appleTvAirPlayVerify';
import appleTvCompanionLinkVerify from './appleTvCompanionLinkVerify';
import appleTvLaunchApp from './appleTvLaunchApp';
import homePodPlayAudio from './homePodPlayAudio';
import mdnsScan from './mdnsScan';
import interactiveAppleTv from './interactiveAppleTv';
import interactiveHomePod from './interactiveHomePod';

process.on('SIGINT', () => {
    stopSavingLogs();
    process.exit(0);
});

process.on('SIGQUIT', () => {
    stopSavingLogs();
    process.exit(0);
});

const storage = new JsonStorage();
await storage.load();

console.log('Welcome to the diagnostics tool for Apple Protocols.');
console.log('With this tool, all traffic between the library and your Apple devices is being logged. Please only share the logs with Bas when asked, as the log contains encryption keys.');
console.log();
console.log('Press Control-C to exit.');
console.log();

while (true) {
    const response: Record<string, string> = await prompt({
        name: 'feature',
        type: 'select',
        message: 'What would you like to test?',
        choices: [
            {message: 'Interactive Apple TV', name: 'interactive-appletv'},
            {message: 'Interactive HomePod', name: 'interactive-homepod'},
            {message: 'Pair (AirPlay)', name: 'airplay-pair'},
            {message: 'Pair (Companion Link)', name: 'companion-link-pair'},
            {message: 'Apple TV Verify (AirPlay)', name: 'appletv-airplay-verify'},
            {message: 'Apple TV Verify (Companion Link)', name: 'appletv-companion-link-verify'},
            {message: 'Apple TV Launch App', name: 'appletv-launch-app'},
            {message: 'AirPlay Monitor', name: 'airplay-monitor'},
            {message: 'AirPlay Play URL', name: 'airplay-play-url'},
            {message: 'AirPlay Stream Audio', name: 'airplay-stream-audio'},
            {message: 'AirPlay Listen', name: 'airplay-listen'},
            {message: 'HomePod Play Audio (RAOP)', name: 'homepod-play-audio'},
            {message: 'mDNS Scan', name: 'mdns-scan'},
            {message: 'Quit', name: 'quit'}
        ]
    });

    if (response.feature === 'quit') {
        stopSavingLogs();
        process.exit(0);
    }

    console.log();

    try {
        switch (response.feature) {
            case 'interactive-appletv':
                await interactiveAppleTv(storage);
                break;

            case 'interactive-homepod':
                await interactiveHomePod(storage);
                break;

            case 'airplay-pair':
                reporter.all();
                await airplayPair(storage);
                break;

            case 'companion-link-pair':
                reporter.all();
                await companionLinkPair(storage);
                break;

            case 'appletv-airplay-verify':
                reporter.all();
                await appleTvAirPlayVerify(storage);
                break;

            case 'appletv-companion-link-verify':
                reporter.all();
                await appleTvCompanionLinkVerify(storage);
                break;

            case 'appletv-launch-app':
                reporter.all();
                await appleTvLaunchApp(storage);
                break;

            case 'airplay-monitor':
                await airplayMonitor(storage);
                break;

            case 'airplay-play-url':
                reporter.all();
                await airplayPlayUrl(storage);
                break;

            case 'airplay-stream-audio':
                reporter.all();
                await airplayStreamAudio(storage);
                break;

            case 'airplay-listen':
                reporter.all();
                await airplayListen(storage);
                break;

            case 'homepod-play-audio':
                reporter.all();
                await homePodPlayAudio();
                break;

            case 'mdns-scan':
                await mdnsScan();
                break;
        }
    } catch (err) {
        console.error('An error occurred:', err);
    }

    console.log();
    await prompt({
        name: '_',
        type: 'input',
        message: 'Press Enter to return to the main menu...'
    });
    console.log();
}
