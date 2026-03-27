import * as AirPlay from '@basmilius/apple-airplay';
import { Live } from '@basmilius/apple-audio-source';
import { AUDIO_BYTES_PER_CHANNEL, AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, type AccessoryKeys, type Storage, TimingServer } from '@basmilius/apple-common';
import { prompt } from 'enquirer';
import getSavedCredentials from './getSavedCredentials';
import { startSavingLogs } from './logger';
import { discoverAndSelectDevice, isAppleTVDevice } from './shared';

const FRAME_SIZE = AUDIO_CHANNELS * AUDIO_BYTES_PER_CHANNEL;

/**
 * Generates PCM sine wave data and writes it into a Live audio source.
 * Runs until the source is ended.
 */
async function generateSineWave(source: Live, frequency: number, durationSeconds: number): Promise<void> {
    const totalFrames = durationSeconds * AUDIO_SAMPLE_RATE;
    const chunkFrames = 1024;
    let phase = 0;
    let framesWritten = 0;

    while (framesWritten < totalFrames && !source.ended) {
        const framesToWrite = Math.min(chunkFrames, totalFrames - framesWritten);
        const buffer = Buffer.allocUnsafe(framesToWrite * FRAME_SIZE);

        for (let i = 0; i < framesToWrite; i++) {
            const sample = Math.sin(phase) * 0.3;
            const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));

            // Big-endian, both channels.
            buffer.writeInt16BE(int16, i * FRAME_SIZE);
            buffer.writeInt16BE(int16, i * FRAME_SIZE + 2);

            phase += (2 * Math.PI * frequency) / AUDIO_SAMPLE_RATE;
        }

        source.write(buffer);
        framesWritten += framesToWrite;

        // Yield to event loop to allow consumer to read.
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    source.end();
}

export default async function (storage: Storage): Promise<void> {
    console.log('This tool streams a live-generated sine wave to an AirPlay device.');
    console.log('It demonstrates the Live audio source with ring buffer.');
    console.log();

    const device = await discoverAndSelectDevice('airplay', 'Which device would you like to stream to?');

    if (!device) {
        return;
    }

    const durationResponse: Record<string, string> = await prompt({
        name: 'duration',
        type: 'input',
        message: 'Duration in seconds:',
        initial: '10'
    });

    const frequencyResponse: Record<string, string> = await prompt({
        name: 'frequency',
        type: 'input',
        message: 'Frequency in Hz:',
        initial: '440'
    });

    const duration = parseInt(durationResponse.duration) || 10;
    const frequency = parseInt(frequencyResponse.frequency) || 440;
    const isAppleTV = isAppleTVDevice(device);

    startSavingLogs();

    const timingServer = new TimingServer();
    await timingServer.listen();

    const protocol = new AirPlay.Protocol(device);
    protocol.useTimingServer(timingServer);

    console.log('Connecting...');
    await protocol.connect();
    await protocol.fetchInfo();

    let keys: AccessoryKeys | undefined;

    if (isAppleTV) {
        const credentials = getSavedCredentials(storage, device, 'airplay');
        keys = await protocol.verify.start(credentials);
    } else {
        await protocol.pairing.start();
        keys = await protocol.pairing.transient();
    }

    if (!keys) {
        console.error('No keys found.');
        return;
    }

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    console.log('Setting up event stream...');
    await protocol.setupEventStreamForAudioStreaming(keys.sharedSecret, keys.pairingId);

    const feedbackInterval = setInterval(() => protocol.feedback().catch(() => {}), 2000);

    console.log('Setting volume...');
    await protocol.controlStream.setParameter('volume', '-20');

    const source = new Live(2);

    console.log(`Streaming ${frequency}Hz sine wave for ${duration}s...`);
    console.log(`  Ring buffer: ${source.capacity} bytes (${(source.capacity / FRAME_SIZE / AUDIO_SAMPLE_RATE).toFixed(1)}s)`);

    // Start producer and consumer in parallel.
    const producerPromise = generateSineWave(source, frequency, duration);

    try {
        await protocol.setupAudioStream(source);
        await producerPromise;
        console.log('Live stream complete.');
    } catch (err) {
        console.error('Stream error:', err);
        source.end();
    } finally {
        clearInterval(feedbackInterval);
        protocol.disconnect();
        timingServer.close();
    }
}
