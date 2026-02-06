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

    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(valueBuffer.length, 0);

    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
}

export function encodeContainer(tag: string, content: Buffer): Buffer {
    if (tag.length !== 4) {
        throw new Error(`Invalid DAAP tag: ${tag}. Tags must be exactly 4 characters.`);
    }

    const tagBuffer = Buffer.from(tag, 'ascii');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(content.length, 0);

    return Buffer.concat([tagBuffer, lengthBuffer, content]);
}

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

export type ContentCodeKey = keyof typeof ContentCode;

export type DecodedTag = {
    readonly tag: string;
    readonly length: number;
    readonly value: Buffer;
};

export type PlaybackStatus = {
    readonly playing?: boolean;
    readonly shuffle?: boolean;
    readonly repeat?: 'off' | 'one' | 'all';
};

export type TrackMetadata = {
    readonly title?: string;
    readonly artist?: string;
    readonly albumArtist?: string;
    readonly album?: string;
    readonly composer?: string;
    readonly genre?: string;
    readonly duration?: number;
    readonly trackNumber?: number;
    readonly trackCount?: number;
    readonly discNumber?: number;
    readonly discCount?: number;
    readonly year?: number;
    readonly bitrate?: number;
    readonly sampleRate?: number;
    readonly size?: number;
};
