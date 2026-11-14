/*
 * Constructs proxy components without binding sockets to catch import and initialization failures.
 * Run: bun run packages/diagnostics/test/proxy-smoke.ts
 */

import { MdnsResponder } from '@corewire/core/discovery';
import { generateAccessoryIdentity } from '@corewire/core/pairing';
import { Context } from '@corewire/core/transport';
import { AirPlayProxy } from '../src/main/proxy/airplay/proxy';
import { ControlConnection } from '../src/main/proxy/airplay/controlConnection';
import { CompanionLinkProxy } from '../src/main/proxy/companionLink/proxy';
import { FramedConnection } from '../src/main/proxy/core/framedConnection';
import { ProxyTap } from '../src/main/proxy/core/tap';
import { ProxyStore } from '../src/main/proxy/store';

const context = new Context('proxy-smoke');

// Constructors must not throw or bind anything.
const store = new ProxyStore('/tmp/apple-proxy-smoke.json');
store.load();
const identity = store.accessoryIdentity('smoke-device');
const tap = new ProxyTap(context, 'companion-link');
const responder = new MdnsResponder(context.logger, {instance: 'Smoke (Proxy)', type: '_companion-link._tcp.local', host: 'smoke.local', port: 49152, txt: {model: 'AppleTV14,1'}});

tap.record('controller->device', 8, {_i: '_systemInfo', _t: 2, _x: 1}, Buffer.alloc(0), Date.now());
tap.close();

void FramedConnection;
void CompanionLinkProxy;
void AirPlayProxy;
void ControlConnection;
void generateAccessoryIdentity;
void responder;

if (!identity.identifier.includes(':') || identity.publicKey.byteLength !== 32) {
    throw new Error('accessory identity looks wrong');
}

if (tap.counts['controller->device'] !== 1) {
    throw new Error('the tap did not count the recorded message');
}

console.log('✓ proxy modules load and construct; accessory identity', identity.identifier, '| local address', MdnsResponder.localAddress());
