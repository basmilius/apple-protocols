import { RaopFinder, RaopSession } from './src/raop';

console.log('🎵 RAOP Demo - Full Session Test\n');

const finder = new RaopFinder();
const devices = await finder.locateDevices();

if (devices.length === 0) {
  console.log('❌ No devices available for testing');
  process.exit(1);
}

const targetDevice = devices[0];
console.log(`🎯 Testing with: ${targetDevice.id}`);
console.log(`   ${targetDevice.address}:${targetDevice.service.port}\n`);

const session = new RaopSession(targetDevice);

try {
  // Step 1: Establish RTSP control connection
  console.log('⏳ Establishing RTSP connection...');
  await session.establish();
  console.log('✅ RTSP connection established');

  // Step 2: Setup session with audio format
  console.log('\n⏳ Setting up audio session (ALAC 44.1kHz stereo)...');
  await session.setupSession();
  console.log('✅ Session setup complete');
  
  const config = session.getSessionConfig();
  if (config) {
    console.log(`   Audio: ${config.audioFormat.codec} ${config.audioFormat.sampleRate}Hz`);
    console.log(`   Transport: ${config.transport.protocol}`);
    console.log(`   Ports: client=${config.transport.clientPort}, server=${config.transport.serverPort}`);
  }

  // Step 3: Start playback
  console.log('\n⏳ Starting playback...');
  await session.startPlayback();
  console.log('✅ Playback started');

  // Step 4: Set volume
  console.log('\n⏳ Setting volume to 50%...');
  await session.setVolume(0.5);
  console.log('✅ Volume set');

  // Note: To actually play audio, you would need to:
  // 1. Read audio file (e.g., PCM or encode to ALAC)
  // 2. Send via session.sendAudio(audioBuffer)
  // 3. Handle timing for smooth playback
  console.log('\n💡 Session is ready for audio streaming');
  console.log('   Use session.sendAudio(buffer) to send audio data');

  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 5: Teardown
  console.log('\n⏳ Closing session...');
  await session.teardown();
  console.log('✅ Session closed successfully');

} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  await session.teardown();
  process.exit(1);
}
