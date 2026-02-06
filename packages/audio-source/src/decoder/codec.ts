export function isMp3File(buffer: Buffer): boolean {
    // Check for ID3 tag or MP3 frame sync
    return (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) // ID3v2 tag
        || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0); // MP3 frame sync
}

export function isOggFile(buffer: Buffer): boolean {
    // Check for OggS magic bytes
    return buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS';
}

export function isWavFile(buffer: Buffer): boolean {
    return buffer.length > 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WAVE';
}
