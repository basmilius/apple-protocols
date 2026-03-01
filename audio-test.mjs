import { readFileSync } from 'node:fs';
import { reporter, TimingServer } from './packages/common/dist/index.mjs';
import * as AudioSource from './packages/audio-source/dist/index.mjs';
import { RaopClient } from './packages/raop/dist/index.mjs';

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

// const audioSource = new AudioSource.Ffmpeg(new URL('.audio/doorbell.ogg', import.meta.url).pathname, 5);
// await audioSource.start();

// const audioSource = new AudioSource.Ffmpeg(new URL('.audio/olympics.mp3', import.meta.url).pathname, 5);
// await audioSource.start();

const audioSource = await AudioSource.Mp3.fromBuffer(readFileSync('.audio/olympics.mp3'));

// const audioSource = await AudioSource.Ogg.fromUrl('https://bmcdn.nl/doorbell.ogg');

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
    timingServer.close();
    console.log('👋 Disconnected');
}
