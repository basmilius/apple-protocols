import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiverFeatures, encodeFeatures } from '../src/features';
import { Protocol } from '../src/protocol';
import { Plist } from '@basmilius/apple-encoding';

test('extended features decode all bits and take precedence over the legacy mask', () => {
    assert.equal(parseReceiverFeatures({features: 123, featuresEx: 'AQAAAAAAAAAAAAAABA=='}), 1n | (1n << 98n));
});
test('legacy features retain low bits above Number precision', () => {
    const value = (1n << 60n) | 1n;
    for (const features of [value, value.toString(), `0x${value.toString(16)}`]) assert.equal(parseReceiverFeatures({features}), value);
    assert.throws(() => parseReceiverFeatures({features: Number(value)}), /imprecise/);
    assert.equal(parseReceiverFeatures({features: '1a0'}), 0x1a0n);
});
test('SETUP feature representations roundtrip through binary plist without losing bits', () => {
    for (const value of [0n, 1n, (1n << 60n) | 1n, (1n << 98n) | 1n]) {
        const body = Plist.parse(new Uint8Array(Plist.serialize(encodeFeatures(value))).slice().buffer) as Record<string, unknown>;
        assert.equal(parseReceiverFeatures(body), value);
        assert.equal(BigInt(body.features as bigint), value & 0xffffffffffffffffn);
    }
});
test('rejects invalid extended feature strings', () => {
    for (const featuresEx of ['!', 'A', '====', 'AB==']) assert.throws(() => parseReceiverFeatures({featuresEx}), /base64/);
});
test('fetchInfo decodes a real-shaped base64 feature response', async () => {
    const protocol = new Protocol({id: 'test', address: '127.0.0.1', service: {port: 0}} as any);
    protocol.controlStream.get = async () => new Response(new Uint8Array(Plist.serialize({features: 1, featuresEx: 'AQAAAAAAAAAAAAAABA=='})).slice());
    await protocol.fetchInfo();
    assert.equal(protocol.receiverFeatures, 1n | (1n << 98n));
    protocol.destroy();
});
