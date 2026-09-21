/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { create, fromBinary, setExtension, toBinary } from '@bufbuild/protobuf';
import { describeProtocolMessage } from '../src/describeProtocolMessage';
import * as Proto from '../src/proto';

describe('protocol message diagnostics', () => {
    test('decodes a wire payload without changing the original message', () => {
        const outgoing = create(Proto.ProtocolMessageSchema, {type: Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE, identifier: 'volume'});
        setExtension(outgoing, Proto.volumeDidChangeMessage, create(Proto.VolumeDidChangeMessageSchema, {volume: 0.25}));
        const bytes = toBinary(Proto.ProtocolMessageSchema, outgoing);
        const incoming = fromBinary(Proto.ProtocolMessageSchema, bytes);

        expect(describeProtocolMessage(incoming)).toMatchObject({type: 52, typeName: 'VOLUME_DID_CHANGE_MESSAGE', identifier: 'volume', payload: {volume: 0.25}});
        expect(describeProtocolMessage(incoming)).not.toHaveProperty('$unknown');
        expect(toBinary(Proto.ProtocolMessageSchema, incoming)).toEqual(bytes);
    });

    test('decodes known extensions even for an unrecognized message type', () => {
        const message = create(Proto.ProtocolMessageSchema, {type: 9999 as Proto.ProtocolMessage_Type});
        setExtension(message, Proto.getVolumeMessage, create(Proto.GetVolumeMessageSchema));

        expect(describeProtocolMessage(message)).toMatchObject({typeName: 'type=9999', payload: {$typeName: 'GetVolumeMessage'}});
    });

    test('does not invent a payload when the extension is absent', () => {
        const message = create(Proto.ProtocolMessageSchema, {type: Proto.ProtocolMessage_Type.VOLUME_DID_CHANGE_MESSAGE});

        expect(describeProtocolMessage(message)).not.toHaveProperty('payload');
    });

    test('retains unknown fields alongside a decoded extension', () => {
        const message = create(Proto.ProtocolMessageSchema);
        setExtension(message, Proto.volumeDidChangeMessage, create(Proto.VolumeDidChangeMessageSchema, {volume: 0.5}));
        const unknown = {no: 9999, wireType: 0 as const, data: new Uint8Array([1])};
        message.$unknown.push(unknown);

        expect(describeProtocolMessage(message)).toMatchObject({payload: {volume: 0.5}, $unknown: [unknown]});
    });

    test('keeps malformed payloads and reports the decode failure', () => {
        const message = create(Proto.ProtocolMessageSchema);
        message.$unknown = [{no: 56, wireType: 2, data: new Uint8Array([10])}];

        const decoded = describeProtocolMessage(message);
        expect(decoded.$unknown).toEqual(message.$unknown);
        expect(decoded.decodeErrors).toHaveProperty('volumeDidChangeMessage');
        expect(decoded).not.toHaveProperty('payload');
    });
});
