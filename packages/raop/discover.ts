import { RaopFinder } from './src/finder';

console.log('🔍 Searching for RAOP devices...\n');

const finder = new RaopFinder();
const devices = await finder.locateDevices();

if (devices.length === 0) {
  console.log('❌ No RAOP devices found on network');
  process.exit(1);
}

console.log(`✅ Found ${devices.length} device(s):\n`);

for (const device of devices) {
  console.log(`📱 ${device.id}`);
  console.log(`   Address: ${device.address}:${device.service.port}`);
  console.log(`   FQDN: ${device.fqdn}`);
  
  if (Object.keys(device.txt).length > 0) {
    console.log(`   Properties:`);
    for (const [key, value] of Object.entries(device.txt)) {
      console.log(`     ${key}: ${value}`);
    }
  }
  console.log();
}
