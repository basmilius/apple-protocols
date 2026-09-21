/*
 * Tests HAP M1-M6 pair-setup and M1-M4 pair-verify in memory, including shared-secret agreement.
 * Run: bun run packages/common/test/pairing-server.ts
 */

import { Context } from '../src/context';
import { AccessoryPair, AccessoryPairServer, AccessoryVerify, AccessoryVerifyServer, generateAccessoryIdentity } from '../src/pairing';

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`assertion failed: ${message}`);
    }
}

async function main(): Promise<void> {
    const context = new Context('proxy-pairing-test');
    const identity = generateAccessoryIdentity();
    const pin = '1234';

    const pairServer = new AccessoryPairServer(context, identity, pin);
    const pairClient = new AccessoryPair(context, (_step, data) => pairServer.handle(data));

    await pairClient.start();
    const credentials = await pairClient.pin(async () => pin);

    assert(credentials.accessoryIdentifier === identity.identifier, 'accessory identifier round-trips to the client');
    assert(credentials.accessoryLongTermPublicKey.equals(identity.publicKey), 'accessory long-term public key round-trips to the client');
    assert(pairServer.controller !== undefined, 'server captured the controller identity');
    assert(pairServer.controller!.identifier === credentials.pairingId.toString(), 'server controller id matches the client pairing id');
    assert(pairServer.controller!.longTermPublicKey.equals(credentials.publicKey), 'server captured the controller public key');

    console.log('pair-setup ok: controller', pairServer.controller!.identifier, '<-> accessory', identity.identifier);

    const resolveController = (pairingId: string) =>
        pairServer.controller && pairServer.controller.identifier === pairingId
            ? pairServer.controller.longTermPublicKey
            : undefined;

    const verifyServer = new AccessoryVerifyServer(context, identity, resolveController);
    const verifyClient = new AccessoryVerify(context, (_step, data) => verifyServer.handle(data));

    const keys = await verifyClient.start(credentials);

    assert(verifyServer.sharedSecret !== undefined, 'server derived a shared secret');
    assert(keys.sharedSecret.equals(verifyServer.sharedSecret!), 'client and server derived the same ECDH shared secret');
    assert(verifyServer.pairingId !== undefined && verifyServer.pairingId.toString() === credentials.pairingId.toString(), 'server verified the controller pairing id');

    console.log('pair-verify ok: shared secret', keys.sharedSecret.toString('hex').slice(0, 16), '…');
    console.log('\n✓ HAP server-side pairing interoperates with the existing client.');
}

main().catch((error) => {
    console.error('\n✗ pairing verification failed:', error);
    process.exit(1);
});
