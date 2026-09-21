import { DAAP, NSKeyedArchiver, NTP, OPack, Plist, TLV8 } from '@basmilius/apple-encoding';
import type { RoundTripResult } from '@shared/contract';
import { firstDifference, parseBytes, readJson, readString, toHex } from './bytes';
import { bytesInput, jsonInput, type ToolDefinition } from './registry';

/** `parse` wants an `ArrayBuffer`, and a pooled `Buffer` is a window on a much larger one. */
const toArrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const byteAt = (buffer: Buffer, offset: number): string | null => (offset < 0 || offset >= buffer.length ? null : `0x${buffer[offset]!.toString(16).padStart(2, '0')}`);

const roundTrip = (input: Buffer, output: Buffer): RoundTripResult => {
    const offset = firstDifference(input, output);

    return {
        ok: offset === -1,
        inputLength: input.length,
        outputLength: output.length,
        offset,
        expected: byteAt(input, offset),
        actual: byteAt(output, offset),
        input: input.toString('hex'),
        output: output.toString('hex')
    };
};

const TLV8_NAMES = new Map<number, string>(Object.entries(TLV8.Value).map(([name, type]) => [type as number, name]));

/**
 * A decoded TLV8 map as rows rather than a `Map`, so the tree shows the name behind a type byte
 * and the value as hex next to its printable form.
 */
const tlv8Rows = (entries: Map<number, Buffer>): unknown[] =>
    Array.from(entries.entries()).map(([type, value]) => ({
        type: `0x${type.toString(16).padStart(2, '0')}`,
        name: TLV8_NAMES.get(type) ?? 'Unknown',
        length: value.length,
        hex: value.toString('hex'),
        text: value.every(byte => byte >= 0x20 && byte < 0x7f) ? value.toString('utf8') : null
    }));

/** Accepts `[[6, "01"], ["State", "01"]]`: a type byte or the name of one, plus a hex value. */
const tlv8Entries = (value: unknown): [number, Buffer][] => {
    if (!Array.isArray(value)) {
        throw new Error('Expected an array of [type, value] pairs.');
    }

    return value.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new Error(`Entry ${index} is not a [type, value] pair.`);
        }

        const [type, data] = entry as [unknown, unknown];
        const resolved = typeof type === 'number' ? type : (TLV8.Value as Record<string, number>)[String(type)];

        if (resolved === undefined) {
            throw new Error(`Entry ${index} has an unknown type '${String(type)}'.`);
        }

        return [resolved, parseBytes(data, `entry ${index}`)];
    });
};

export const ENCODING_TOOLS: readonly ToolDefinition[] = [
    {
        id: 'opack.decode',
        title: 'Decode OPack',
        description: 'Reads an OPack payload into a JSON tree. Companion Link frames their bodies this way.',
        category: 'encoding',
        section: 'OPack',
        inputs: [bytesInput()],
        run: args => OPack.decode(parseBytes(args.data, 'data'))
    },
    {
        id: 'opack.encode',
        title: 'Encode OPack',
        description: 'Encodes a JSON value as OPack.',
        category: 'encoding',
        section: 'OPack',
        inputs: [jsonInput()],
        run: args => {
            const encoded = OPack.encode(readJson(args, 'value'));
            return {hex: toHex(encoded), length: encoded.length};
        }
    },
    {
        id: 'opack.roundtrip',
        title: 'Round-trip OPack',
        description: 'Decodes and re-encodes, and reports the first byte that came back different.',
        category: 'encoding',
        section: 'OPack',
        inputs: [bytesInput()],
        run: args => {
            const input = parseBytes(args.data, 'data');
            return roundTrip(input, Buffer.from(OPack.encode(OPack.decode(input))));
        }
    },
    {
        id: 'plist.decode',
        title: 'Decode binary plist',
        description: 'Parses a binary property list. AirPlay setup bodies and RTSP payloads are plists.',
        category: 'encoding',
        section: 'Plist',
        inputs: [bytesInput()],
        run: args => Plist.parse(toArrayBuffer(parseBytes(args.data, 'data')))
    },
    {
        id: 'plist.encode',
        title: 'Encode binary plist',
        description: 'Serializes a JSON value as a binary property list.',
        category: 'encoding',
        section: 'Plist',
        inputs: [jsonInput()],
        run: args => {
            const encoded = Buffer.from(Plist.serialize(readJson(args, 'value') as never));
            return {hex: encoded.toString('hex'), length: encoded.length};
        }
    },
    {
        id: 'plist.roundtrip',
        title: 'Round-trip binary plist',
        description: 'Parses and re-serializes, and reports the first byte that came back different.',
        category: 'encoding',
        section: 'Plist',
        inputs: [bytesInput()],
        run: args => {
            const input = parseBytes(args.data, 'data');
            return roundTrip(input, Buffer.from(Plist.serialize(Plist.parse(toArrayBuffer(input)))));
        }
    },
    {
        id: 'tlv8.decode',
        title: 'Decode TLV8',
        description: 'Splits a HAP pairing payload into its type, length and value rows.',
        category: 'encoding',
        section: 'TLV8',
        inputs: [bytesInput()],
        run: args => tlv8Rows(TLV8.decode(parseBytes(args.data, 'data')))
    },
    {
        id: 'tlv8.encode',
        title: 'Encode TLV8',
        description: 'Builds a TLV8 payload from [type, value] pairs. A type is a byte or a name such as "State".',
        category: 'encoding',
        section: 'TLV8',
        inputs: [{name: 'value', label: 'Entries (JSON)', type: 'textarea', placeholder: '[["State", "01"], ["Method", "00"]]', rows: 5}],
        run: args => {
            const encoded = TLV8.encode(tlv8Entries(readJson(args, 'value')));
            return {hex: encoded.toString('hex'), length: encoded.length};
        }
    },
    {
        id: 'tlv8.roundtrip',
        title: 'Round-trip TLV8',
        description: 'Decodes and re-encodes. A payload with a value over 255 bytes comes back fragmented differently, which shows here.',
        category: 'encoding',
        section: 'TLV8',
        inputs: [bytesInput()],
        run: args => {
            const input = parseBytes(args.data, 'data');
            const decoded = TLV8.decode(input);
            return roundTrip(input, TLV8.encode(Array.from(decoded.entries())));
        }
    },
    {
        id: 'daap.decode',
        title: 'Decode DAAP',
        description: 'Reads a DAAP buffer as its tags, and as the flat object the RAOP metadata path builds.',
        category: 'encoding',
        section: 'DAAP',
        inputs: [bytesInput()],
        run: args => {
            const input = parseBytes(args.data, 'data');

            return {
                tags: DAAP.decode(input).map(tag => ({tag: tag.tag, length: tag.length, hex: tag.value.toString('hex')})),
                object: DAAP.decodeToObject(input),
                trackMetadata: DAAP.decodeTrackMetadata(input)
            };
        }
    },
    {
        id: 'daap.encodeTag',
        title: 'Encode DAAP tag',
        description: 'Encodes one four-character tag. A numeric value is written at the byte size the tag expects.',
        category: 'encoding',
        section: 'DAAP',
        inputs: [
            {name: 'tag', label: 'Tag', type: 'text', placeholder: 'minm', default: 'minm'},
            {name: 'value', label: 'Value', type: 'text', placeholder: 'Never Gonna Give You Up'},
            {name: 'kind', label: 'Value type', type: 'select', default: 'string', options: [{value: 'string', label: 'String'}, {value: 'number', label: 'Number'}, {value: 'bytes', label: 'Bytes (hex)'}]}
        ],
        run: args => {
            const kind = readString(args, 'kind', 'string');
            const raw = readString(args, 'value');
            const value = kind === 'number' ? Number(raw) : kind === 'bytes' ? parseBytes(raw, 'value') : raw;

            if (kind === 'number' && !Number.isFinite(value as number)) {
                throw new Error("'value' is not a number.");
            }

            const encoded = DAAP.encodeTag(readString(args, 'tag'), value as Buffer | string | number);

            return {hex: encoded.toString('hex'), length: encoded.length};
        }
    },
    {
        id: 'daap.roundtrip',
        title: 'Round-trip DAAP track metadata',
        description: 'Decodes the track metadata and re-encodes it. Fields the encoder does not write show up as a difference.',
        category: 'encoding',
        section: 'DAAP',
        inputs: [bytesInput()],
        run: args => {
            const input = parseBytes(args.data, 'data');
            return roundTrip(input, DAAP.encodeTrackMetadata(DAAP.decodeTrackMetadata(input)));
        }
    },
    {
        id: 'nskeyedarchiver.decode',
        title: 'Decode NSKeyedArchiver',
        description: 'Parses a binary plist and unpacks the NSKeyedArchiver object graph inside it.',
        category: 'encoding',
        section: 'NSKeyedArchiver',
        inputs: [
            bytesInput('data', 'Archive (hex or base64 binary plist)', 5),
            {name: 'asArray', label: 'Decode as array', type: 'boolean', default: false, hint: 'Use for an archive whose root is an NSArray.'}
        ],
        run: args => {
            const archive = Plist.parse(toArrayBuffer(parseBytes(args.data, 'data')));
            return args.asArray === true || args.asArray === 'true' ? NSKeyedArchiver.decodeAsArray(archive) : NSKeyedArchiver.decode(archive);
        }
    },
    {
        id: 'ntp.now',
        title: 'NTP now',
        description: 'The current wall clock as a 64-bit NTP timestamp, with the seconds and fraction it splits into.',
        category: 'encoding',
        section: 'NTP',
        inputs: [],
        run: () => {
            const value = NTP.now();
            const [seconds, fraction] = NTP.parts(value);

            return {
                ntp: value.toString(),
                hex: `0x${value.toString(16).padStart(16, '0')}`,
                seconds,
                fraction,
                iso: new Date((seconds - 2208988800) * 1000 + Math.round((fraction / 0x100000000) * 1000)).toISOString()
            };
        }
    },
    {
        id: 'ntp.decode',
        title: 'Decode NTP packet',
        description: 'Reads a timing packet of at least 24 bytes into its fields.',
        category: 'encoding',
        section: 'NTP',
        inputs: [bytesInput('data', 'Packet (hex or base64)', 3)],
        run: args => NTP.decode(parseBytes(args.data, 'data'))
    },
    {
        id: 'ntp.encode',
        title: 'Encode NTP packet',
        description: 'Writes the packet fields back into the 32 bytes they occupy.',
        category: 'encoding',
        section: 'NTP',
        inputs: [{name: 'value', label: 'Fields (JSON)', type: 'textarea', placeholder: '{"proto": 128, "type": 210, "seqno": 0, "padding": 0, "reftime_sec": 0, "reftime_frac": 0, "recvtime_sec": 0, "recvtime_frac": 0, "sendtime_sec": 0, "sendtime_frac": 0}', rows: 6}],
        run: args => {
            const encoded = NTP.encode(readJson(args, 'value') as never);
            return {hex: encoded.toString('hex'), length: encoded.length};
        }
    },
    {
        id: 'ntp.roundtrip',
        title: 'Round-trip NTP packet',
        description: 'Decodes and re-encodes. A packet shorter than 32 bytes comes back padded, which shows as a length difference.',
        category: 'encoding',
        section: 'NTP',
        inputs: [bytesInput('data', 'Packet (hex or base64)', 3)],
        run: args => {
            const input = parseBytes(args.data, 'data');
            return roundTrip(input, NTP.encode(NTP.decode(input)));
        }
    }
];
