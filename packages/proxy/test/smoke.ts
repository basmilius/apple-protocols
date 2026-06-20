// Lightweight runtime smoke test: imports and constructs the proxy building blocks (without binding
// sockets) to catch module-resolution, circular-import, and obvious wiring errors.
//
// Run: bun run packages/proxy/test/smoke.ts

import { Context, generateAccessoryIdentity } from '@basmilius/apple-common';
import { FramedConnection } from '../src/core/framedConnection';
import { MdnsResponder } from '../src/core/mdnsResponder';
import { ProxyTap } from '../src/core/tap';
import { ProxyStore } from '../src/store';
import { CompanionLinkProxy } from '../src/companionLink/proxy';
import { AirPlayProxy } from '../src/airplay/proxy';
import { ControlConnection } from '../src/airplay/controlConnection';

const context = new Context('proxy-smoke');

// Constructors must not throw or bind anything.
const store = new ProxyStore('/tmp/apple-proxy-smoke.json');
store.load();
const identity = store.accessoryIdentity('smoke-device');
const tap = new ProxyTap('companion-link');
const responder = new MdnsResponder(context, {instance: 'Smoke (Proxy)', type: '_companion-link._tcp.local', host: 'smoke.local', port: 49152, txt: {model: 'AppleTV14,1'}});

void FramedConnection;
void CompanionLinkProxy;
void AirPlayProxy;
void ControlConnection;
void generateAccessoryIdentity;
void responder;
void tap;

if (!identity.identifier.includes(':') || identity.publicKey.byteLength !== 32) {
    throw new Error('accessory identity looks wrong');
}

console.log('✓ proxy modules load and construct; accessory identity', identity.identifier, '| local address', MdnsResponder.localAddress());
