import { Discovery, reporter, TimingServer } from '@basmilius/apple-common';
import * as AudioSource from '../audio-source';
import * as AirPlay from './src';

reporter.all();

const timingServer = new TimingServer();
await timingServer.listen();

console.log('🔍 Discovering device...');
const discovery = Discovery.airplay();
const discoveryResult = await discovery.findUntil('Woonkamer-HomePod.local');

console.log('✅ Found device:', discoveryResult.id);
console.log('   Address:', discoveryResult.address);
console.log('   Port:', discoveryResult.service.port);

const protocol = new AirPlay.Protocol(discoveryResult);
protocol.useTimingServer(timingServer);

console.log('\n📡 Connecting...');
await protocol.connect();
console.log('✅ Connected');

console.log('\n🔐 Starting transient pairing...');
await protocol.pairing.start();
const keys = await protocol.pairing.transient();
console.log('✅ Pairing complete');

protocol.controlStream.enableEncryption(
    keys.accessoryToControllerKey,
    keys.controllerToAccessoryKey
);

console.log('\n🔧 Setting up streams...');
await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);
// await protocol.setupDataStream(keys.sharedSecret);
console.log('✅ Streams ready');

const feedbackInterval = setInterval(() => protocol.feedback(), 2000);

console.log('\n🎵 Setting up audio stream...');
const audioStream = new AirPlay.EXPERIMENTAL_AudioStream(protocol);
const {dataPort} = await audioStream.setup();
console.log(`✅ Audio stream ready, dataPort=${dataPort}`);

console.log('\n🔊 Setting volume...');
await protocol.controlStream.setParameter('volume', '50');  // -20 dB is a reasonable volume
// OR if you have a setVolume method somewhere
console.log('✅ Volume set');

console.log('\n🎶 Loading audio file with ffmpeg...');
const audioSource = new AudioSource.Ffmpeg(
    new URL('../../.audio/doorbell.ogg', import.meta.url).pathname,
    5
);
await audioSource.start();

// const pcmBuffer = readFileSync(new URL('../../.audio/doorbell.pcm', import.meta.url).pathname);
// const audioSource = new AirPlay.AudioSource.Pcm(pcmBuffer);
// await audioSource.start();

// const audioSource = new AirPlay.AudioSource.SineWave(5, 440);
console.log('✅ Audio file loaded');

console.log('\n🔊 Streaming audio...');
try {
    await audioStream.stream(audioSource, discoveryResult.address);
    console.log('\n✅ Streaming complete!');
} catch (err) {
    console.error('\n❌ Streaming error:', err);
} finally {
    audioSource.stop();
    audioStream.close();
    clearInterval(feedbackInterval);
}

await protocol.disconnect();
console.log('👋 Disconnected');
