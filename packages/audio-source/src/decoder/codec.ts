/**
 * Checks whether the given buffer contains MP3 data by looking for
 * an ID3v2 tag header or an MP3 frame sync word.
 *
 * @param buffer - Raw audio data to inspect.
 * @returns True if the buffer starts with MP3 magic bytes.
 */
export function isMp3(buffer: Buffer): boolean {
    return (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) // ID3v2 tag
        || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0); // MP3 frame sync
}

/**
 * Checks whether the given buffer contains OGG data by looking
 * for the "OggS" capture pattern.
 *
 * @param buffer - Raw audio data to inspect.
 * @returns True if the buffer starts with the OGG magic bytes.
 */
export function isOgg(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'OggS';
}

/**
 * Checks whether the given buffer contains WAV data by looking
 * for the RIFF header with a WAVE format identifier.
 *
 * @param buffer - Raw audio data to inspect.
 * @returns True if the buffer starts with the WAV magic bytes.
 */
export function isWav(buffer: Buffer): boolean {
    return buffer.length > 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WAVE';
}
