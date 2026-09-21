import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, toBinary } from '@bufbuild/protobuf';
import { Context } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import { DataStream } from '../src/dataStream';
import { buildHeader, buildReply, encodeVarint, parseMessages, readVariant } from '../src/utils';
import { ProtocolMessageSchema } from '../src/proto';

function response(identifier: string): Buffer {
    const message = toBinary(ProtocolMessageSchema, create(ProtocolMessageSchema, {identifier}));
    const payload = Plist.serialize({params: {data: Uint8Array.from([...encodeVarint(message.length), ...message]).buffer}});
    return Buffer.concat([buildHeader(32 + payload.byteLength, 7n), Buffer.from(payload)]);
}

test('transport ACKs do not resolve requests; out-of-order protobuf responses do', async () => {
    const stream = new DataStream(new Context('test'), '127.0.0.1', 0);
    stream.send = () => {};
    const replies: bigint[] = [];
    stream.reply = seq => { replies.push(seq); };
    const errors: unknown[] = [];
    stream.on('error', error => { errors.push(error); });
    try {
        const first = stream.exchange(create(ProtocolMessageSchema, {identifier: 'first'}));
        const second = stream.exchange(create(ProtocolMessageSchema, {identifier: 'second'}));
        let firstDone = false;
        void first.then(() => { firstDone = true; });
        await stream.onStreamData(buildReply(1n));
        await stream.onStreamData(Buffer.concat([buildReply(2n), response('second')]));
        assert.equal((await second).identifier, 'second');
        assert.equal(firstDone, false);
        const bytes = response('first');
        for (let i = 0; i < bytes.length; i++) await stream.onStreamData(bytes.subarray(i, i + 1));
        assert.equal((await first).identifier, 'first');
        assert.deepEqual(errors, []);
        assert.deepEqual(replies, [7n, 7n]);
    } finally {
        stream.destroy();
    }
});
for (const length of [0, 31, 16 * 1024 * 1024 + 1]) {
    test(`rejects invalid DataStream length ${length}`, async () => {
        const stream = new DataStream(new Context('test'), '127.0.0.1', 0);
        let error: Error | undefined;
        stream.on('error', value => { error = value; });
        await stream.onStreamData(buildHeader(length, 0n));
        assert.match(error?.message ?? '', /Invalid DataStream frame length/);
        stream.destroy();
    });
}

test('message framing handles eight-byte prefixes, bare messages and malformed varints', () => {
    const message = toBinary(ProtocolMessageSchema, create(ProtocolMessageSchema, {identifier: 'second'}));
    assert.equal(message.length, 8);
    assert.equal(parseMessages(Buffer.from([8, ...message]))[0].identifier, 'second');
    assert.equal(parseMessages(Buffer.from([8, 1]))[0].type, 1);
    assert.throws(() => parseMessages(Buffer.from([9, 8, 1])), /length/);
    for (const bytes of [[128], [255, 255, 255, 255, 16], [128, 128, 128, 128, 128]]) {
        assert.throws(() => readVariant(Buffer.from(bytes)), RangeError);
    }
    assert.deepEqual(readVariant(Buffer.from(encodeVarint(0xffffffff))), [0xffffffff, 5]);
    for (const value of [-1, 0.5, NaN, Infinity, 0x100000000]) assert.throws(() => encodeVarint(value), RangeError);
});
