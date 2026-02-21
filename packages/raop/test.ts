import { reporter, TimingServer } from '@basmilius/apple-common';
import { RaopClient } from './src';
import * as AudioSource from '@basmilius/apple-audio-source';

reporter.all();

const timingServer = new TimingServer();
await timingServer.listen();

const client = await RaopClient.discover('Slaapkamer-HomePod.local', timingServer);

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
    new URL('../../.audio/doorbell.ogg', import.meta.url).pathname,
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
        volume: 15
    });

    console.log('✅ Streaming complete!');
} catch (err) {
    console.error('❌ Streaming error:', err);
} finally {
    await client.close();
    console.log('👋 Disconnected');
}

