import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode } from '../src/tlv8';

for (const bytes of [[1], [1, 4, 65], [1, 1, 65, 1, 4, 66]]) {
    test(`rejects truncated TLV ${bytes.join(',')}`, () => assert.throws(() => decode(Buffer.from(bytes)), /Truncated TLV8/));
}
test('reassembles fragmented pairing values and preserves empty fields', () => {
    const value = Buffer.alloc(700, 42);
    const decoded = decode(encode([[3, value], [6, 2], [255, Buffer.alloc(0)]]));
    assert.deepEqual(decoded.get(3), value);
    assert.deepEqual(decoded.get(6), Buffer.from([2]));
    assert.equal(decoded.get(255)?.length, 0);
});
