// @ts-nocheck
import getType from 'audio-type';
import AudioBufferShim from 'audio-buffer';

const AudioBuffer = globalThis.AudioBuffer || AudioBufferShim;

export default async function audioDecode(buf) {
    if (!buf && !(buf.length || buf.buffer)) throw Error('Bad decode target');
    buf = new Uint8Array(buf.buffer || buf);

    let type = getType(buf);

    if (!type) throw Error('Cannot detect audio format');

    if (!decoders[type]) throw Error('Missing decoder for ' + type + ' format');

    return decoders[type](buf);
};

export const decoders = {
    async oga(buf) {
        let {decoder} = decoders.oga;
        if (!decoder) {
            let {OggVorbisDecoder} = await import('@wasm-audio-decoders/ogg-vorbis');
            await (decoders.oga.decoder = decoder = new OggVorbisDecoder()).ready;
        } else await decoder.reset();
        return buf && createBuffer(await decoder.decodeFile(buf));
    },
    async mp3(buf) {
        let {decoder} = decoders.mp3;
        if (!decoder) {
            const {MPEGDecoder} = await import('mpg123-decoder');
            await (decoders.mp3.decoder = decoder = new MPEGDecoder()).ready;
        } else await decoder.reset();
        return buf && createBuffer(await decoder.decode(buf));
    },
    async flac(buf) {
        let {decoder} = decoders.flac;
        if (!decoder) {
            const {FLACDecoder} = await import('@wasm-audio-decoders/flac');
            await (decoders.flac.decoder = decoder = new FLACDecoder()).ready;
        } else await decoder.reset();
        return buf && createBuffer(await decoder.decode(buf));
    },
    // async opus(buf) {
    //     let {decoder} = decoders.opus;
    //     if (!decoder) {
    //         const {OggOpusDecoder} = await import('ogg-opus-decoder');
    //         await (decoders.opus.decoder = decoder = new OggOpusDecoder()).ready;
    //     } else await decoder.reset();
    //     return buf && createBuffer(await decoder.decodeFile(buf));
    // },
    async wav(buf) {
        let {decode} = decoders.wav;
        if (!decode) {
            let module = await import('node-wav');
            decode = decoders.wav.decode = module.default.decode;
        }

        try {
            return buf && createBuffer(await decode(buf));
        } catch {
            // Fallback for WAVE_FORMAT_EXTENSIBLE (0xFFFE) which node-wav doesn't support.
            return buf && createBuffer(decodeWavExtensible(buf));
        }
    },
    async qoa(buf) {
        let {decode} = decoders.qoa;
        if (!decode) {
            decoders.qoa.decode = decode = (await import('qoa-format')).decode;
        }
        return buf && createBuffer(await decode(buf));
    }
};

function decodeWavExtensible(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let offset = 12; // skip RIFF header + WAVE

    let sampleRate = 44100;
    let numChannels = 2;
    let containerBits = 16;
    let validBits = 16;
    let isFloat = false;
    let dataBuffer = null;

    while (offset < buf.byteLength - 8) {
        const chunkId = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
        const chunkSize = view.getUint32(offset + 4, true);
        offset += 8;

        if (chunkId === 'fmt ') {
            const audioFormat = view.getUint16(offset, true);

            if (audioFormat !== 0xFFFE && audioFormat !== 1 && audioFormat !== 3) {
                throw new Error(`Unsupported WAV format: ${audioFormat}`);
            }

            numChannels = view.getUint16(offset + 2, true);
            sampleRate = view.getUint32(offset + 4, true);
            containerBits = view.getUint16(offset + 14, true);
            validBits = containerBits;
            isFloat = audioFormat === 3;

            if (audioFormat === 0xFFFE && chunkSize >= 40) {
                validBits = view.getUint16(offset + 18, true);

                // SubFormat GUID at offset+24: first 2 bytes indicate PCM (1) or float (3)
                const subFormat = view.getUint16(offset + 24, true);
                isFloat = subFormat === 3;
            }
        } else if (chunkId === 'data') {
            dataBuffer = buf.subarray(offset, offset + chunkSize);
        }

        offset += chunkSize;

        if (chunkSize % 2 !== 0) {
            offset++;
        }
    }

    if (!dataBuffer) {
        throw new Error('No data chunk found in WAV file');
    }

    // Use container size for byte stride, valid bits for sample interpretation
    const bytesPerSample = containerBits / 8;
    const numFrames = Math.floor(dataBuffer.byteLength / (numChannels * bytesPerSample));
    const channelData = [];

    for (let ch = 0; ch < numChannels; ch++) {
        channelData.push(new Float32Array(numFrames));
    }

    const dataView = new DataView(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);

    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const byteOffset = (i * numChannels + ch) * bytesPerSample;
            let sample;

            if (isFloat && bytesPerSample === 4) {
                sample = dataView.getFloat32(byteOffset, true);
            } else if (isFloat && bytesPerSample === 8) {
                sample = dataView.getFloat64(byteOffset, true);
            } else if (bytesPerSample === 2) {
                sample = dataView.getInt16(byteOffset, true) / 32768;
            } else if (bytesPerSample === 3) {
                const b0 = dataBuffer[byteOffset];
                const b1 = dataBuffer[byteOffset + 1];
                const b2 = dataBuffer[byteOffset + 2];
                const value = (b2 << 16) | (b1 << 8) | b0;
                sample = (value > 0x7FFFFF ? value - 0x1000000 : value) / 8388608;
            } else if (bytesPerSample === 4) {
                // 24-bit in 32-bit container (left-justified) or true 32-bit int
                const value = dataView.getInt32(byteOffset, true);
                if (validBits <= 24) {
                    sample = (value >> (32 - validBits)) / (1 << (validBits - 1));
                } else {
                    sample = value / 2147483648;
                }
            } else {
                sample = 0;
            }

            channelData[ch][i] = Math.max(-1, Math.min(1, sample));
        }
    }

    return { channelData, sampleRate };
}

function createBuffer({channelData, sampleRate}) {
    let audioBuffer = new AudioBuffer({
        sampleRate,
        length: channelData[0].length,
        numberOfChannels: channelData.length
    });

    for (let ch = 0; ch < channelData.length; ch++) {
        audioBuffer.getChannelData(ch).set(channelData[ch]);
    }

    return audioBuffer;
}
