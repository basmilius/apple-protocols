import { reporter } from '@basmilius/apple-common';
import { prompt } from 'enquirer';

import { stopSavingLogs } from './logger';
import airplayListen from './airplayListen';
import airplayPair from './airplayPair';
import companionLinkPair from './companionLinkPair';
import appleTvAirPlayVerify from './appleTvAirPlayVerify';
import appleTvCompanionLinkVerify from './appleTvCompanionLinkVerify';
import appleTvLaunchApp from './appleTvLaunchApp';
import homePodPlayAudio from './homePodPlayAudio';

process.on('SIGINT', () => {
    stopSavingLogs();
});

process.on('SIGQUIT', () => {
    stopSavingLogs();
});

reporter.all();

console.log('Welcome to the diagnostics tool for Apple Protocols.');
console.log('With this tool, all traffic between the library and your Apple devices is being logged. Please only share the logs with Bas when asked, as the log contains encryption keys.');
console.log();
console.log('Press Control-C to exit.');
console.log();

const response: Record<string, string> = await prompt({
    name: 'feature',
    type: 'select',
    message: 'What would you like to test?',
    choices: [
        {message: 'Pair (AirPlay)', name: 'airplay-pair'},
        {message: 'Pair (Companion Link)', name: 'companion-link-pair'},
        {message: 'Apple TV Verify (AirPlay)', name: 'appletv-airplay-verify'},
        {message: 'Apple TV Verify (Companion Link)', name: 'appletv-companion-link-verify'},
        {message: 'Apple TV Launch App', name: 'appletv-launch-app'},
        {message: 'AirPlay Listen', name: 'airplay-listen'},
        {message: 'HomePod Play Audio', name: 'homepod-play-audio'}
    ]
});

console.log();

switch (response.feature) {
    case 'airplay-pair':
        await airplayPair();
        break;

    case 'companion-link-pair':
        await companionLinkPair();
        break;

    case 'appletv-airplay-verify':
        await appleTvAirPlayVerify();
        break;

    case 'appletv-companion-link-verify':
        await appleTvCompanionLinkVerify();
        break;

    case 'appletv-launch-app':
        await appleTvLaunchApp();
        break;

    case 'airplay-listen':
        await airplayListen();
        break;

    case 'homepod-play-audio':
        await homePodPlayAudio();
        break;

    default:
        console.error(`Invalid feature ${response.feature}.`);
        process.exit(1);
}

console.log('Done');
