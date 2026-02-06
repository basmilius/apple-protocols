export function isMp3(buffer: Buffer): boolean {
    return (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) // ID3v2 tag
        || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0); // MP3 frame sync
}

export function isOgg(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS';
}

export function isWav(buffer: Buffer): boolean {
    return buffer.length > 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WAVE';
}
