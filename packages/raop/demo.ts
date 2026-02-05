import { RaopFinder, RaopSession } from './src/raop';

console.log('🎵 RAOP Demo - Basic Connection Test\n');

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
  console.log('⏳ Establishing connection...');
  await session.establish();
  console.log('✅ Connection established successfully');
  console.log(`   Session active: ${session.isActive()}`);
  console.log(`   Device: ${session.getDeviceIdentifier()}`);
  
  console.log('\n⏳ Closing connection...');
  await session.teardown();
  console.log('✅ Connection closed');
} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
