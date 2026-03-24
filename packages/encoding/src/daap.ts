/**
 * Maps four-character DAAP tag codes to their human-readable DMAP/DAAP content code names.
 * Used to identify the semantic meaning of tags in DAAP protocol messages.
 */
export const ContentCode = {
    // Container tags
    mlit: 'dmap.listingitem',
    mlcl: 'dmap.listing',
    msrv: 'dmap.serverinforesponse',
    mcon: 'dmap.container',

    // Item metadata
    miid: 'dmap.itemid',
    minm: 'dmap.itemname',
    mikd: 'dmap.itemkind',
    mper: 'dmap.persistentid',

    // Song metadata
    asal: 'daap.songalbum',
    asar: 'daap.songartist',
    asaa: 'daap.songalbumartist',
    ascp: 'daap.songcomposer',
    asgn: 'daap.songgenre',
    astm: 'daap.songtime',
    astn: 'daap.songtracknumber',
    asdc: 'daap.songdisccount',
    asdn: 'daap.songdiscnumber',
    astc: 'daap.songtrackcount',
    asyr: 'daap.songyear',
    asbr: 'daap.songbitrate',
    assr: 'daap.songsamplerate',
    assz: 'daap.songsize',

    // Playback status
    caps: 'daap.songplaystatus',
    cash: 'daap.songshufflestate',
    carp: 'daap.songrepeatstate',
    cavs: 'daap.songvisiblestate',

    // Album art
    aePP: 'com.apple.itunes.photo-properties'
} as const;

/**
 * Maps four-character DAAP tag codes to their data type identifiers.
 *
 * Type values: 1=byte, 2=unsigned byte, 3=short, 4=unsigned short,
 * 5=int, 6=unsigned int, 7=long, 8=unsigned long,
 * 9=string, 10=date, 11=version, 12=container.
 *
 * Used by the decoder to determine how to interpret the raw bytes of each tag.
 */
export const TagType = {
    // 1 = byte, 2 = unsigned byte, 3 = short, 4 = unsigned short,
    // 5 = int, 6 = unsigned int, 7 = long, 8 = unsigned long,
    // 9 = string, 10 = date, 11 = version, 12 = container

    mlit: 12, // container
    mlcl: 12, // container
    mcon: 12, // container
    msrv: 12, // container

    miid: 5,  // int
    minm: 9,  // string
    mikd: 1,  // byte
    mper: 7,  // long

    asal: 9,  // string
    asar: 9,  // string
    asaa: 9,  // string
    ascp: 9,  // string
    asgn: 9,  // string
    astm: 5,  // int (milliseconds)
    astn: 3,  // short
    asdc: 3,  // short
    asdn: 3,  // short
    astc: 3,  // short
    asyr: 3,  // short
    asbr: 3,  // short
    assr: 5,  // int
    assz: 5,  // int

    caps: 1,  // byte (play status)
    cash: 1,  // byte (shuffle state)
    carp: 1,  // byte (repeat state)
    cavs: 1,  // byte (visible state)

    aePP: 9   // string
} as const;

/**
 * Encodes a single DAAP tag with an automatically sized value.
 * Numbers are encoded in the smallest big-endian representation that fits.
 *
 * @param tag - Four-character ASCII tag code (e.g. 'minm', 'asar').
 * @param value - The value to encode: string (UTF-8), number (auto-sized BE), bigint (8-byte BE), or raw Buffer.
 * @returns A buffer containing the tag, length, and value.
 * @throws Error if the tag is not exactly 4 characters.
 */
export function encodeTag(tag: string, value: Buffer | string | number | bigint): Buffer {
    if (tag.length !== 4) {
        throw new Error(`Invalid DAAP tag: ${tag}. Tags must be exactly 4 characters.`);
    }

    const tagBuffer = Buffer.from(tag, 'ascii');
    let valueBuffer: Buffer;

    if (typeof value === 'string') {
        valueBuffer = Buffer.from(value, 'utf8');
    } else if (typeof value === 'bigint') {
        valueBuffer = Buffer.alloc(8);
        valueBuffer.writeBigUInt64BE(value, 0);
    } else if (typeof value === 'number') {
        // Determine the smallest buffer size needed
        if (value <= 0xFF && value >= 0) {
            valueBuffer = Buffer.alloc(1);
            valueBuffer.writeUInt8(value, 0);
        } else if (value <= 0xFFFF && value >= 0) {
            valueBuffer = Buffer.alloc(2);
            valueBuffer.writeUInt16BE(value, 0);
        } else if (value <= 0xFFFFFFFF && value >= 0) {
            valueBuffer = Buffer.alloc(4);
            valueBuffer.writeUInt32BE(value, 0);
        } else {
            valueBuffer = Buffer.alloc(8);
            valueBuffer.writeBigInt64BE(BigInt(value), 0);
        }
    } else {
        valueBuffer = value;
    }

    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32BE(valueBuffer.length, 0);

    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
}

/**
 * Encodes a DAAP container tag that wraps other encoded tags.
 *
 * @param tag - Four-character ASCII container tag code (e.g. 'mlit', 'mlcl').
 * @param content - Pre-encoded buffer containing the container's child tags.
 * @returns A buffer containing the container tag, length, and nested content.
 * @throws Error if the tag is not exactly 4 characters.
 */
export function encodeContainer(tag: string, content: Buffer): Buffer {
    if (tag.length !== 4) {
        throw new Error(`Invalid DAAP tag: ${tag}. Tags must be exactly 4 characters.`);
    }

    const tagBuffer = Buffer.from(tag, 'ascii');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(content.length, 0);

    return Buffer.concat([tagBuffer, lengthBuffer, content]);
}

/**
 * Encodes playback status fields (playing, shuffle, repeat) into DAAP tags.
 * Only includes tags for fields that are defined in the status object.
 *
 * @param status - The playback status to encode.
 * @returns A buffer containing the encoded DAAP status tags.
 */
export function encodePlaybackStatus(status: PlaybackStatus): Buffer {
    const tags: Buffer[] = [];

    if (status.playing !== undefined) {
        tags.push(encodeTagWithSize('caps', status.playing ? 4 : 3, 1));
    }

    if (status.shuffle !== undefined) {
        tags.push(encodeTagWithSize('cash', status.shuffle ? 1 : 0, 1));
    }

    if (status.repeat !== undefined) {
        let repeatValue = 0;
        if (status.repeat === 'one') repeatValue = 1;
        else if (status.repeat === 'all') repeatValue = 2;
        tags.push(encodeTagWithSize('carp', repeatValue, 1));
    }

    return Buffer.concat(tags);
}

/**
 * Encodes a DAAP tag with an explicitly specified byte size for the numeric value.
 * Useful when the protocol requires a specific size regardless of the value magnitude.
 *
 * @param tag - Four-character ASCII tag code.
 * @param value - The numeric value to encode.
 * @param byteSize - The exact number of bytes to use for the value (1, 2, 4, or 8).
 * @returns A buffer containing the tag, length, and fixed-size value.
 * @throws Error if the tag is not exactly 4 characters.
 */
export function encodeTagWithSize(tag: string, value: number, byteSize: 1 | 2 | 4 | 8): Buffer {
    if (tag.length !== 4) {
        throw new Error(`Invalid DAAP tag: ${tag}. Tags must be exactly 4 characters.`);
    }

    const tagBuffer = Buffer.from(tag, 'ascii');
    const valueBuffer = Buffer.alloc(byteSize);

    switch (byteSize) {
        case 1:
            valueBuffer.writeUInt8(value, 0);
            break;
        case 2:
            valueBuffer.writeUInt16BE(value, 0);
            break;
        case 4:
            valueBuffer.writeUInt32BE(value, 0);
            break;
        case 8:
            valueBuffer.writeBigUInt64BE(BigInt(value), 0);
            break;
    }

    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(byteSize, 0);

    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
}

/**
 * Encodes track metadata into a DAAP listing item (`mlit`) container.
 * Only includes tags for fields that are defined in the metadata object.
 * Duration is converted from seconds to milliseconds for the `astm` tag.
 *
 * @param metadata - The track metadata to encode.
 * @returns A buffer containing an `mlit` container with all defined metadata tags.
 */
export function encodeTrackMetadata(metadata: TrackMetadata): Buffer {
    const tags: Buffer[] = [];

    if (metadata.title !== undefined) {
        tags.push(encodeTag('minm', metadata.title));
    }

    if (metadata.artist !== undefined) {
        tags.push(encodeTag('asar', metadata.artist));
    }

    if (metadata.albumArtist !== undefined) {
        tags.push(encodeTag('asaa', metadata.albumArtist));
    }

    if (metadata.album !== undefined) {
        tags.push(encodeTag('asal', metadata.album));
    }

    if (metadata.composer !== undefined) {
        tags.push(encodeTag('ascp', metadata.composer));
    }

    if (metadata.genre !== undefined) {
        tags.push(encodeTag('asgn', metadata.genre));
    }

    if (metadata.duration !== undefined) {
        // Duration in milliseconds
        tags.push(encodeTagWithSize('astm', Math.floor(metadata.duration * 1000), 4));
    }

    if (metadata.trackNumber !== undefined) {
        tags.push(encodeTagWithSize('astn', metadata.trackNumber, 2));
    }

    if (metadata.trackCount !== undefined) {
        tags.push(encodeTagWithSize('astc', metadata.trackCount, 2));
    }

    if (metadata.discNumber !== undefined) {
        tags.push(encodeTagWithSize('asdn', metadata.discNumber, 2));
    }

    if (metadata.discCount !== undefined) {
        tags.push(encodeTagWithSize('asdc', metadata.discCount, 2));
    }

    if (metadata.year !== undefined) {
        tags.push(encodeTagWithSize('asyr', metadata.year, 2));
    }

    if (metadata.bitrate !== undefined) {
        tags.push(encodeTagWithSize('asbr', metadata.bitrate, 2));
    }

    if (metadata.sampleRate !== undefined) {
        tags.push(encodeTagWithSize('assr', metadata.sampleRate, 4));
    }

    if (metadata.size !== undefined) {
        tags.push(encodeTagWithSize('assz', metadata.size, 4));
    }

    const content = Buffer.concat(tags);

    return encodeContainer('mlit', content);
}

/**
 * Decodes all DAAP tags from a buffer sequentially.
 * Stops when the buffer is exhausted or a tag cannot be fully decoded.
 *
 * @param buffer - The raw DAAP-encoded buffer.
 * @returns An array of decoded tags with their raw value buffers.
 */
export function decode(buffer: Buffer): DecodedTag[] {
    const tags: DecodedTag[] = [];
    let remaining = buffer;

    while (remaining.length > 0) {
        const result = decodeTag(remaining);
        if (!result) break;

        const [tag, rest] = result;
        tags.push(tag);
        remaining = rest;
    }

    return tags;
}

/**
 * Decodes a single DAAP tag from the start of a buffer.
 * Returns the decoded tag and the remaining unconsumed buffer.
 *
 * @param buffer - The buffer to decode from. Must contain at least 8 bytes (4 tag + 4 length).
 * @returns A tuple of the decoded tag and remaining buffer, or null if the buffer is too short.
 */
export function decodeTag(buffer: Buffer): [DecodedTag, Buffer] | null {
    if (buffer.length < 8) {
        return null;
    }

    const tag = buffer.subarray(0, 4).toString('ascii');
    const length = buffer.readUInt32BE(4);

    if (buffer.length < 8 + length) {
        return null;
    }

    const value = buffer.subarray(8, 8 + length);
    const remaining = buffer.subarray(8 + length);

    return [{tag, length, value}, remaining];
}

/**
 * Decodes a DAAP buffer into a plain object, interpreting values based on {@link TagType}.
 * Container tags (type 12) are recursively decoded. Unknown tags are kept as raw buffers.
 *
 * @param buffer - The raw DAAP-encoded buffer.
 * @returns An object mapping tag codes to their decoded values.
 */
export function decodeToObject(buffer: Buffer): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const tags = decode(buffer);

    for (const {tag, value} of tags) {
        const tagType = TagType[tag as keyof typeof TagType] as number | undefined;

        if (tagType === undefined) {
            // Unknown tag type - keep as buffer
            result[tag] = value;
        } else if (tagType === 12) {
            // Container - recurse
            result[tag] = decodeToObject(value);
        } else if (tagType === 9) {
            // String
            result[tag] = value.toString('utf8');
        } else if (tagType === 1 || tagType === 2) {
            // Byte
            result[tag] = value.readUInt8(0);
        } else if (tagType === 3 || tagType === 4) {
            // Short
            result[tag] = value.readUInt16BE(0);
        } else if (tagType === 5 || tagType === 6) {
            // Int
            result[tag] = value.readUInt32BE(0);
        } else if (tagType === 7 || tagType === 8) {
            // Long
            result[tag] = value.readBigUInt64BE(0);
        } else {
            // Unknown type - keep as buffer
            result[tag] = value;
        }
    }

    return result;
}

/**
 * Decodes a DAAP buffer into a structured {@link TrackMetadata} object.
 * Handles both bare tag lists and `mlit`-wrapped containers.
 * Duration is converted from the DAAP millisecond `astm` value back to seconds.
 *
 * @param buffer - The raw DAAP-encoded buffer containing track metadata.
 * @returns The decoded track metadata.
 */
export function decodeTrackMetadata(buffer: Buffer): TrackMetadata {
    const obj = decodeToObject(buffer);
    const mlit = (obj.mlit as Record<string, unknown>) ?? obj;

    return {
        title: mlit.minm as string | undefined,
        artist: mlit.asar as string | undefined,
        albumArtist: mlit.asaa as string | undefined,
        album: mlit.asal as string | undefined,
        composer: mlit.ascp as string | undefined,
        genre: mlit.asgn as string | undefined,
        duration: mlit.astm !== undefined ? (mlit.astm as number) / 1000 : undefined,
        trackNumber: mlit.astn as number | undefined,
        trackCount: mlit.astc as number | undefined,
        discNumber: mlit.asdn as number | undefined,
        discCount: mlit.asdc as number | undefined,
        year: mlit.asyr as number | undefined,
        bitrate: mlit.asbr as number | undefined,
        sampleRate: mlit.assr as number | undefined,
        size: mlit.assz as number | undefined
    };
}

/** Union type of all valid four-character DAAP content code keys. */
export type ContentCodeKey = keyof typeof ContentCode;

/** Represents a single decoded DAAP tag with its raw value buffer. */
export type DecodedTag = {
    /** The four-character ASCII tag code. */
    readonly tag: string;
    /** The byte length of the value. */
    readonly length: number;
    /** The raw undecoded value bytes. */
    readonly value: Buffer;
};

/** Represents the playback state of a DAAP media player. */
export type PlaybackStatus = {
    /** Whether the player is currently playing. */
    readonly playing?: boolean;
    /** Whether shuffle mode is enabled. */
    readonly shuffle?: boolean;
    /** The repeat mode: off, repeat one track, or repeat all. */
    readonly repeat?: 'off' | 'one' | 'all';
};

/** Metadata for a single media track in the DAAP protocol. */
export type TrackMetadata = {
    /** Track title (DAAP tag `minm`). */
    readonly title?: string;
    /** Track artist (DAAP tag `asar`). */
    readonly artist?: string;
    /** Album artist (DAAP tag `asaa`). */
    readonly albumArtist?: string;
    /** Album name (DAAP tag `asal`). */
    readonly album?: string;
    /** Composer name (DAAP tag `ascp`). */
    readonly composer?: string;
    /** Genre name (DAAP tag `asgn`). */
    readonly genre?: string;
    /** Track duration in seconds. Converted to/from milliseconds during encoding/decoding. */
    readonly duration?: number;
    /** Track number within the album (DAAP tag `astn`). */
    readonly trackNumber?: number;
    /** Total number of tracks on the album (DAAP tag `astc`). */
    readonly trackCount?: number;
    /** Disc number within the set (DAAP tag `asdn`). */
    readonly discNumber?: number;
    /** Total number of discs in the set (DAAP tag `asdc`). */
    readonly discCount?: number;
    /** Release year (DAAP tag `asyr`). */
    readonly year?: number;
    /** Bitrate in kbps (DAAP tag `asbr`). */
    readonly bitrate?: number;
    /** Sample rate in Hz (DAAP tag `assr`). */
    readonly sampleRate?: number;
    /** File size in bytes (DAAP tag `assz`). */
    readonly size?: number;
};
