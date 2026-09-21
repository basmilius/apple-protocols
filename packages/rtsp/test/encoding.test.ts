import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, parseResponse, buildResponse } from '../src/encoding';

for (const name of ['CSeq', 'cseq', 'CSEQ', 'CsEq']) {
    test(`request preserves CSeq with ${name} casing`, () => {
        const request = parseRequest(Buffer.from(`POST /event RTSP/1.0\r\n${name}: 42\r\nContent-Length: 0\r\n\r\n`))!;
        const response = parseResponse(buildResponse({status: 200, statusText: 'OK', headers: {CSeq: request.headers.CSeq}}))!;
        assert.equal(response.response.headers.get('CSeq'), '42');
    });
}
for (const length of ['-100', '1.5', 'junk', '', 'Infinity', '9007199254740992', '16777217', '0x10']) {
    test(`rejects invalid Content-Length ${JSON.stringify(length)}`, () => {
        for (const [line, parse] of [['POST / RTSP/1.0', parseRequest], ['RTSP/1.0 200 OK', parseResponse]] as const) {
            assert.throws(() => parse(Buffer.from(`${line}\r\nContent-Length: ${length}\r\n\r\n`)), /Content-Length/);
        }
    });
}
test('rejects conflicting duplicate lengths and oversized headers', () => {
    assert.throws(() => parseRequest(Buffer.from('POST / RTSP/1.0\r\nContent-Length: 1\r\ncontent-length: 2\r\n\r\na')), /Conflicting/);
    assert.throws(() => parseRequest(Buffer.alloc(65537, 65)), /maximum length/);
});
test('parses fragmented and coalesced binary bodies without consuming the next request', () => {
    const message = Buffer.concat([Buffer.from('POST / RTSP/1.0\r\nContent-Length: 4\r\n\r\n'), Buffer.from([0, 255, 1, 2])]);
    for (let length = 0; length < message.length; length++) assert.equal(parseRequest(message.subarray(0, length)), null);
    const parsed = parseRequest(Buffer.concat([message, message]))!;
    assert.equal(parsed.requestLength, message.length);
    assert.deepEqual(parsed.body, Buffer.from([0, 255, 1, 2]));
});
for (const status of [204, 205, 304]) {
    test(`accepts empty ${status} on Node and Bun`, () => {
        const parsed = parseResponse(Buffer.from(`RTSP/1.0 ${status} Empty\r\nContent-Length: 0\r\n\r\n`))!;
        assert.equal(parsed.response.status, status);
        assert.equal(parsed.response.body, null);
    });
}
