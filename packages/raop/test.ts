import { reporter, TimingServer } from '@basmilius/apple-common';
import { RaopClient } from './src';
import * as AudioSource from '../audio-source/dist';
import { readFileSync } from 'node:fs';

reporter.all();

const timingServer = new TimingServer();
await timingServer.listen();

async function main(): Promise<void> {
    const client = await RaopClient.discover('Woonkamer-HomePod.local', timingServer);

    client.on('playing', (playbackInfo) => {
        console.log('▶️  Playing:', playbackInfo.metadata.title);
    });

    client.on('stopped', () => {
        console.log('⏹️  Stopped');
    });

    console.log('✅ Connected to:', client.deviceId);
    console.log('   Model:', client.modelName);
    console.log('   Address:', client.address);

    const audioSource = new AudioSource.Ffmpeg(
        new URL('../../.audio/olympics.mp3', import.meta.url).pathname,
        5
    );

    try {
        await client.stream(audioSource, {
            metadata: {
                title: 'Olympics',
                artist: 'RAOP Test',
                album: 'Test Album',
                duration: 5
            },
            volume: 25
        });

        console.log('✅ Streaming complete!');
    } catch (err) {
        console.error('❌ Streaming error:', err);
    } finally {
        await client.close();
        console.log('👋 Disconnected');
    }
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
