import { readFileSync } from 'node:fs';
import { RaopFinder, RaopSession } from './src/raop';

/**
 * Example: Stream PCM audio file to RAOP device
 * 
 * This demonstrates a complete RAOP streaming workflow.
 * For production use, you would:
 * - Read from an audio file or live source
 * - Handle timing to match the sample rate
 * - Add error recovery and buffering
 */

console.log('🎵 RAOP Audio Streaming Example\n');

// Configuration
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BITS_PER_SAMPLE = 16;
const SAMPLES_PER_FRAME = 352; // Common frame size for ALAC/PCM

async function streamAudio() {
  // Step 1: Find devices
  console.log('🔍 Searching for RAOP devices...');
  const finder = new RaopFinder();
  const devices = await finder.locateDevices();

  if (devices.length === 0) {
    console.log('❌ No RAOP devices found');
    process.exit(1);
  }

  console.log(`✅ Found ${devices.length} device(s)`);
  devices.forEach((device, i) => {
    console.log(`   ${i + 1}. ${device.id} (${device.address})`);
  });

  const targetDevice = devices[0];
  console.log(`\n🎯 Using: ${targetDevice.id}\n`);

  // Step 2: Create session
  const session = new RaopSession(targetDevice);

  try {
    // Step 3: Establish connection
    console.log('⏳ Establishing connection...');
    await session.establish();
    console.log('✅ Connected\n');

    // Step 4: Setup audio format
    console.log('⏳ Configuring audio format...');
    await session.setupSession({
      codec: 'PCM', // Using PCM for simplicity (no encoding needed)
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
    });
    console.log('✅ Audio format configured');
    
    const config = session.getSessionConfig();
    if (config) {
      console.log(`   Codec: ${config.audioFormat.codec}`);
      console.log(`   Sample Rate: ${config.audioFormat.sampleRate} Hz`);
      console.log(`   Channels: ${config.audioFormat.channels}`);
      console.log(`   Transport: UDP port ${config.transport.clientPort} → ${config.transport.serverPort}\n`);
    }

    // Step 5: Start playback
    console.log('⏳ Starting playback...');
    await session.startPlayback();
    console.log('✅ Playback started\n');

    // Step 6: Set volume
    console.log('⏳ Setting volume to 30%...');
    await session.setVolume(0.3);
    console.log('✅ Volume set\n');

    // Step 7: Stream audio data
    console.log('🎵 Streaming audio...');
    
    // Generate simple test tone (440 Hz sine wave)
    const duration = 3; // seconds
    const totalSamples = SAMPLE_RATE * duration;
    const frequency = 440; // A4 note
    
    let samplesSent = 0;
    const frameSize = SAMPLES_PER_FRAME * CHANNELS * (BITS_PER_SAMPLE / 8);
    
    while (samplesSent < totalSamples) {
      // Generate audio frame (sine wave)
      const frameSamples = Math.min(SAMPLES_PER_FRAME, totalSamples - samplesSent);
      const frameBuffer = Buffer.allocUnsafe(frameSamples * CHANNELS * (BITS_PER_SAMPLE / 8));
      
      for (let i = 0; i < frameSamples; i++) {
        const t = (samplesSent + i) / SAMPLE_RATE;
        const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3; // 30% amplitude
        const value = Math.floor(sample * 32767); // Convert to 16-bit
        
        // Write stereo samples (both channels same)
        frameBuffer.writeInt16LE(value, i * 4);
        frameBuffer.writeInt16LE(value, i * 4 + 2);
      }
      
      // Send frame
      await session.sendAudio(frameBuffer);
      samplesSent += frameSamples;
      
      // Timing: wait for frame duration
      const frameDuration = (frameSamples / SAMPLE_RATE) * 1000;
      await new Promise(resolve => setTimeout(resolve, frameDuration));
      
      // Progress indicator
      const progress = Math.floor((samplesSent / totalSamples) * 100);
      if (progress % 20 === 0) {
        console.log(`   ${progress}% complete (${samplesSent}/${totalSamples} samples)`);
      }
    }
    
    console.log('✅ Audio streaming complete\n');

    // Step 8: Wait a moment before closing
    console.log('⏳ Waiting for playback to finish...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 9: Teardown
    console.log('⏳ Closing session...');
    await session.teardown();
    console.log('✅ Session closed successfully\n');

    console.log('🎉 Done!');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await session.teardown();
    process.exit(1);
  }
}

// Run the example
streamAudio().catch(console.error);
