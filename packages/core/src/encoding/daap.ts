/**
 * Maps four-character DAAP tag codes to their DMAP/DAAP content code names.
 */
export const ContentCode = {
    mlit: 'dmap.listingitem',
    mlcl: 'dmap.listing',
    msrv: 'dmap.serverinforesponse',
    mcon: 'dmap.container',

    miid: 'dmap.itemid',
    minm: 'dmap.itemname',
    mikd: 'dmap.itemkind',
    mper: 'dmap.persistentid',

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

    caps: 'daap.songplaystatus',
    cash: 'daap.songshufflestate',
    carp: 'daap.songrepeatstate',
    cavs: 'daap.songvisiblestate',

    aePP: 'com.apple.itunes.photo-properties'
} as const;

/**
 * Maps four-character DAAP tag codes to the type the decoder reads their value as.
 *
 * Type values: 1=byte, 2=unsigned byte, 3=short, 4=unsigned short,
 * 5=int, 6=unsigned int, 7=long, 8=unsigned long,
 * 9=string, 10=date, 11=version, 12=container.
 */
export const TagType = {
    mlit: 12,
    mlcl: 12,
    mcon: 12,
    msrv: 12,

    miid: 5,
    minm: 9,
    mikd: 1,
    mper: 7,

    asal: 9,
    asar: 9,
    asaa: 9,
    ascp: 9,
    asgn: 9,
    astm: 5, // milliseconds
    astn: 3,
    asdc: 3,
    asdn: 3,
    astc: 3,
    asyr: 3,
    asbr: 3,
    assr: 5,
    assz: 5,

    caps: 1,
    cash: 1,
    carp: 1,
    cavs: 1,

    aePP: 9
} as const;

/**
 * Encodes a single DAAP tag. A number takes the smallest big-endian size that fits.
 *
 * @param tag - Four-character ASCII tag code, such as `minm`.
 * @param value - A string is written as UTF-8, a bigint as 8 bytes and a Buffer as is.
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
 * Encodes a DAAP container tag around tags that are already encoded.
 *
 * @param tag - Four-character ASCII container tag code, such as `mlit`.
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
 * Encodes the playback status into DAAP tags, one tag per defined field.
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
 * Encodes a numeric DAAP tag with a fixed value size, for tags whose size the protocol fixes.
 *
 * @param tag - Four-character ASCII tag code.
 * @param byteSize - Size of the big-endian value in bytes.
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
 * Encodes track metadata into a DAAP listing item (`mlit`), one tag per defined field.
 * The duration goes from seconds to the milliseconds of `astm`.
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
 * Decodes the DAAP tags in a buffer, up to its end or the first incomplete tag.
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
 * Decodes the DAAP tag at the start of a buffer.
 *
 * @returns The tag and the rest of the buffer, or null when the buffer holds no complete tag.
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
 * Decodes a DAAP buffer into an object keyed by tag code, with values read as {@link TagType} says.
 * Containers decode recursively; a tag of unknown type keeps its raw buffer.
 */
export function decodeToObject(buffer: Buffer): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const tags = decode(buffer);

    for (const {tag, value} of tags) {
        const tagType = TagType[tag as keyof typeof TagType] as number | undefined;

        if (tagType === undefined) {
            result[tag] = value;
        } else if (tagType === 12) {
            result[tag] = decodeToObject(value);
        } else if (tagType === 9) {
            result[tag] = value.toString('utf8');
        } else if (tagType === 1 || tagType === 2) {
            result[tag] = value.readUInt8(0);
        } else if (tagType === 3 || tagType === 4) {
            result[tag] = value.readUInt16BE(0);
        } else if (tagType === 5 || tagType === 6) {
            result[tag] = value.readUInt32BE(0);
        } else if (tagType === 7 || tagType === 8) {
            result[tag] = value.readBigUInt64BE(0);
        } else {
            result[tag] = value;
        }
    }

    return result;
}

/**
 * Decodes track metadata from a bare tag list or an `mlit` container.
 * The duration goes from the milliseconds of `astm` back to seconds.
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

/** A four-character DAAP content code from {@link ContentCode}. */
export type ContentCodeKey = keyof typeof ContentCode;

/** A decoded DAAP tag with its raw value bytes. */
export type DecodedTag = {
    readonly tag: string;

    /** The length of the value in bytes. */
    readonly length: number;

    readonly value: Buffer;
};

/** The playback state that DAAP sends as `caps`, `cash` and `carp`. */
export type PlaybackStatus = {
    readonly playing?: boolean;
    readonly shuffle?: boolean;
    readonly repeat?: 'off' | 'one' | 'all';
};

/** The metadata of a track, with the DAAP tag that carries each field. */
export type TrackMetadata = {
    /** The title, sent as `minm`. */
    readonly title?: string;

    /** The artist, sent as `asar`. */
    readonly artist?: string;

    /** The album artist, sent as `asaa`. */
    readonly albumArtist?: string;

    /** The album name, sent as `asal`. */
    readonly album?: string;

    /** The composer, sent as `ascp`. */
    readonly composer?: string;

    /** The genre, sent as `asgn`. */
    readonly genre?: string;

    /** The duration in seconds, sent as milliseconds in `astm`. */
    readonly duration?: number;

    /** The track number on the album, sent as `astn`. */
    readonly trackNumber?: number;

    /** The number of tracks on the album, sent as `astc`. */
    readonly trackCount?: number;

    /** The disc number in the set, sent as `asdn`. */
    readonly discNumber?: number;

    /** The number of discs in the set, sent as `asdc`. */
    readonly discCount?: number;

    /** The release year, sent as `asyr`. */
    readonly year?: number;

    /** The bitrate in kbps, sent as `asbr`. */
    readonly bitrate?: number;

    /** The sample rate in Hz, sent as `assr`. */
    readonly sampleRate?: number;

    /** The file size in bytes, sent as `assz`. */
    readonly size?: number;
};
