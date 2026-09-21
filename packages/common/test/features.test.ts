import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordRequired, getPairingRequirement, parseFeatures } from '../src/airplayFeatures';

test('accepts status flags from both Bonjour names and hex notations', () => {
    for (const name of ['sf', 'flags']) {
        for (const value of ['80', '0x80', '0X80']) assert.equal(isPasswordRequired({[name]: value}), true);
        assert.equal(getPairingRequirement({features: '0', [name]: '8'}), 'pin');
        assert.equal(getPairingRequirement({features: '0', [name]: '200'}), 'pin');
    }
    assert.equal(isPasswordRequired({sf: 'not-hex'}), false);
    assert.equal(parseFeatures('0x1,0x80000000'), (1n << 63n) | 1n);
});
