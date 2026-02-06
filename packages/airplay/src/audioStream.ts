import { type Context } from '@basmilius/apple-common';
import { Plist } from '@basmilius/apple-encoding';
import BaseStream from './baseStream';

export interface AudioFormat {
    codec: 'PCM' | 'ALAC' | 'AAC';
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
}

export interface AudioStreamConfig {
    audioFormat: AudioFormat;
    controlPort: number;
    timingPort?: number;
}

/**
 * AudioStream handles RTP audio packet transmission over UDP.
 * This implements the RAOP (Remote Audio Output Protocol) audio streaming
 * for AirPlay v2 devices.
 */
export default class AudioStream extends BaseStream {
    #audioFormat?: AudioFormat;
    #controlPort?: number;
    #timingPort?: number;
    #serverAudioPort?: number;
    #serverControlPort?: number;
    #serverTimingPort?: number;
    #sequenceNumber: number = 0;
    #timestamp: number = 0;

    constructor(context: Context, address: string, port: number) {
        super(context, address, port);
        
        this.on('data', this.#onData.bind(this));
    }

    /**
     * Configure the audio stream with format and ports.
     */
    configure(config: AudioStreamConfig, serverPorts: { audio?: number; control?: number; timing?: number }): void {
        this.#audioFormat = config.audioFormat;
        this.#controlPort = config.controlPort;
        this.#timingPort = config.timingPort;
        this.#serverAudioPort = serverPorts.audio;
        this.#serverControlPort = serverPorts.control;
        this.#serverTimingPort = serverPorts.timing;
        
        this.context.logger.net('[audio]', `Configured: ${this.#audioFormat.codec} ${this.#audioFormat.sampleRate}Hz ${this.#audioFormat.channels}ch`);
    }

    /**
     * Send an RTP audio packet.
     * @param audioData PCM audio data to send
     */
    async sendAudio(audioData: Buffer): Promise<void> {
        if (!this.#audioFormat) {
            throw new Error('Audio stream not configured');
        }

        // Build RTP header
        const rtpHeader = Buffer.alloc(12);
        rtpHeader[0] = 0x80; // V=2, P=0, X=0, CC=0
        rtpHeader[1] = 0x60; // M=0, PT=96 (dynamic payload type for ALAC/PCM)
        rtpHeader.writeUInt16BE(this.#sequenceNumber++, 2); // Sequence number
        rtpHeader.writeUInt32BE(this.#timestamp, 4); // Timestamp
        rtpHeader.writeUInt32BE(0, 8); // SSRC (can be 0 for now)

        // Update timestamp for next packet (assuming 352 frames per packet at 44100 Hz)
        this.#timestamp += 352;

        const rtpPacket = Buffer.concat([rtpHeader, audioData]);

        // Encrypt if needed
        const data = this.isEncrypted ? this.encrypt(rtpPacket) : rtpPacket;

        await this.write(data);
    }

    /**
     * Get the current sequence number.
     */
    get sequenceNumber(): number {
        return this.#sequenceNumber;
    }

    /**
     * Get the current timestamp.
     */
    get timestamp(): number {
        return this.#timestamp;
    }

    #onData(data: Buffer): void {
        // Handle incoming control/timing packets if needed
        if (this.isEncrypted) {
            data = this.decrypt(data);
        }

        // For now, just log that we received data
        this.context.logger.raw('[audio]', `Received ${data.byteLength} bytes`);
    }
}
