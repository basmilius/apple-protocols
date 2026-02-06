import { Discovery, prompt, reporter, waitFor } from '@basmilius/apple-common';
import * as AirPlay from './src';

reporter.all();

/**
 * Example of streaming audio to a HomePod using AirPlay v2 RAOP.
 */
async function streamAudioToHomePod(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Slaapkamer-HomePod.local');
    const protocol = new AirPlay.Protocol(discoveryResult);

    await protocol.connect();

    // Start pairing process
    await protocol.pairing.start();
    const keys = await protocol.pairing.transient();

    // Enable encryption on control stream
    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    // Setup event stream first
    await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);

    // Setup audio stream for RAOP
    await protocol.setupAudioStream(
        keys.sharedSecret,
        {
            codec: 'PCM',
            sampleRate: 44100,
            channels: 2,
            bitsPerSample: 16
        }
    );

    console.log('✅ Audio stream ready!');

    // Start feedback loop to keep connection alive
    setInterval(() => protocol.feedback(), 2000);

    // Generate a simple test tone (440Hz sine wave)
    const duration = 5; // seconds
    const sampleRate = 44100;
    const frequency = 440; // A4 note
    const samplesPerPacket = 352;
    const totalSamples = sampleRate * duration;
    const numPackets = Math.ceil(totalSamples / samplesPerPacket);

    console.log(`🎵 Streaming ${duration}s test tone at ${frequency}Hz...`);

    for (let packet = 0; packet < numPackets; packet++) {
        const audioData = Buffer.alloc(samplesPerPacket * 2 * 2); // 2 bytes per sample, 2 channels
        
        for (let i = 0; i < samplesPerPacket; i++) {
            const sampleIndex = packet * samplesPerPacket + i;
            const time = sampleIndex / sampleRate;
            const value = Math.sin(2 * Math.PI * frequency * time);
            const sample = Math.floor(value * 0x7FFF); // Convert to 16-bit PCM
            
            // Write stereo samples (same value for both channels)
            audioData.writeInt16LE(sample, i * 4);
            audioData.writeInt16LE(sample, i * 4 + 2);
        }

        await protocol.audioStream!.sendAudio(audioData);

        // Small delay to maintain real-time streaming
        // 352 samples at 44100 Hz = ~8ms per packet
        await waitFor(8);
    }

    console.log('✅ Audio streaming complete!');

    // Keep connection alive for a bit
    await waitFor(2000);

    // Cleanup
    await protocol.disconnect();
    await protocol.destroy();
}

/**
 * Example for Apple TV with verify (if already paired).
 */
async function streamAudioToTV(): Promise<void> {
    const discovery = Discovery.airplay();
    const discoveryResult = await discovery.findUntil('Woonkamer-TV.local');
    const protocol = new AirPlay.Protocol(discoveryResult);

    await protocol.connect();

    // Use existing pairing credentials
    const keys = await protocol.verify.start({
        accessoryIdentifier: '7EEEA518-06CC-486C-A8B8-4A07CDBE6267',
        accessoryLongTermPublicKey: Buffer.from('cfb3fb0e0eb494d9058d5051c94400b35251e3faad66542b9551a1496570628d', 'hex'),
        pairingId: Buffer.from('32373938444337422d433646352d343643332d384346382d323034443938353338333734', 'hex'),
        publicKey: Buffer.from('385ae55433ebee4acfba7b1a12ce1cccafea37bd49f86b21691741a647a071ec', 'hex'),
        secretKey: Buffer.from('0be84946aabcca3c99471791b32a64b83eb5c4f8edb62e1535c69507d7720296385ae55433ebee4acfba7b1a12ce1cccafea37bd49f86b21691741a647a071ec', 'hex')
    });

    protocol.controlStream.enableEncryption(
        keys.accessoryToControllerKey,
        keys.controllerToAccessoryKey
    );

    await protocol.setupEventStream(keys.sharedSecret, keys.pairingId);

    // Setup audio stream
    await protocol.setupAudioStream(keys.sharedSecret);

    console.log('✅ Audio stream ready for TV!');

    // Start feedback
    setInterval(() => protocol.feedback(), 2000);

    // Stream some audio...
    console.log('🎵 Streaming audio to TV...');

    // Generate test tone
    for (let i = 0; i < 100; i++) {
        const audioData = Buffer.alloc(352 * 4); // 352 samples, stereo, 16-bit
        // Fill with sine wave or silence
        await protocol.audioStream!.sendAudio(audioData);
        await waitFor(8);
    }

    console.log('✅ Done!');
}

const what = process.argv[2] ?? 'homepod';

switch (what) {
    case 'homepod':
        await streamAudioToHomePod();
        break;

    case 'tv':
        await streamAudioToTV();
        break;

    default:
        console.error(`Unknown target ${what}, use 'homepod' or 'tv'`);
        break;
}
