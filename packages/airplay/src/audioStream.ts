import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import { type Context, Chacha20, ENCRYPTION, type EncryptionState } from '@basmilius/apple-common';
import { nonce } from './utils';

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
export default class AudioStream {
    readonly context: Context;
    readonly #address: string;
    readonly #serverAudioPort: number;
    
    #audioFormat?: AudioFormat;
    #controlSocket?: Socket;
    #timingSocket?: Socket;
    #audioSocket?: Socket;
    #controlPort: number = 0;
    #timingPort: number = 0;
    #serverControlPort?: number;
    #serverTimingPort?: number;
    #sequenceNumber: number = 0;
    #timestamp: number = 0;
    #sharedSecret?: Buffer;
    #encryptionCounter: bigint = BigInt(0);
    #writeKey?: Buffer;
    #readKey?: Buffer;

    constructor(context: Context, address: string, serverAudioPort: number) {
        this.context = context;
        this.#address = address;
        this.#serverAudioPort = serverAudioPort;
    }

    get isEncrypted(): boolean {
        return !!this.#writeKey;
    }

    /**
     * Create and bind UDP sockets for audio streaming.
     */
    async createSockets(): Promise<{ controlPort: number; timingPort: number }> {
        // Create control socket
        this.#controlSocket = createSocket('udp4');
        await new Promise<void>((resolve) => {
            this.#controlSocket!.once('listening', () => {
                const addr = this.#controlSocket!.address();
                this.#controlPort = addr.port;
                this.context.logger.net('[audio]', `Control socket bound to port ${this.#controlPort}`);
                resolve();
            });
            this.#controlSocket!.bind(0);
        });

        // Create timing socket  
        this.#timingSocket = createSocket('udp4');
        await new Promise<void>((resolve) => {
            this.#timingSocket!.once('listening', () => {
                const addr = this.#timingSocket!.address();
                this.#timingPort = addr.port;
                this.context.logger.net('[audio]', `Timing socket bound to port ${this.#timingPort}`);
                resolve();
            });
            this.#timingSocket!.bind(0);
        });

        // Create audio socket
        this.#audioSocket = createSocket('udp4');
        this.#audioSocket.on('message', (data, info) => this.#onAudioData(data, info));
        this.#audioSocket.on('error', (err) => this.context.logger.error('[audio]', 'Audio socket error', err));

        return {
            controlPort: this.#controlPort,
            timingPort: this.#timingPort
        };
    }

    /**
     * Configure the audio stream with format and server ports.
     */
    configure(config: AudioStreamConfig, serverPorts: { control?: number; timing?: number }): void {
        this.#audioFormat = config.audioFormat;
        this.#serverControlPort = serverPorts.control;
        this.#serverTimingPort = serverPorts.timing;
        
        this.context.logger.net('[audio]', `Configured: ${this.#audioFormat.codec} ${this.#audioFormat.sampleRate}Hz ${this.#audioFormat.channels}ch`);
    }

    /**
     * Setup encryption for audio stream.
     */
    setup(sharedSecret: Buffer, counter: bigint): void {
        this.#sharedSecret = sharedSecret;
        this.#encryptionCounter = counter;

        // Derive encryption keys from shared secret
        // For now, we'll use the shared secret directly as the key
        // In full implementation, should use proper key derivation
        this.#writeKey = sharedSecret.subarray(0, 32);
        this.#readKey = sharedSecret.subarray(0, 32);

        this.context.logger.net('[audio]', 'Encryption enabled');
    }

    /**
     * Connect the audio stream.
     */
    async connect(): Promise<void> {
        if (!this.#audioSocket) {
            throw new Error('Audio socket not created');
        }

        await new Promise<void>((resolve) => {
            this.#audioSocket!.once('listening', () => {
                this.context.logger.net('[audio]', `Audio socket ready`);
                resolve();
            });
            this.#audioSocket!.bind(0);
        });
    }

    /**
     * Disconnect and close all sockets.
     */
    async disconnect(): Promise<void> {
        this.#controlSocket?.close();
        this.#timingSocket?.close();
        this.#audioSocket?.close();
        
        this.context.logger.net('[audio]', 'Disconnected');
    }

    /**
     * Destroy the audio stream.
     */
    async destroy(): Promise<void> {
        await this.disconnect();
    }

    /**
     * Send an RTP audio packet.
     * @param audioData PCM audio data to send
     */
    async sendAudio(audioData: Buffer): Promise<void> {
        if (!this.#audioFormat) {
            throw new Error('Audio stream not configured');
        }

        if (!this.#audioSocket) {
            throw new Error('Audio socket not created');
        }

        // Build RTP header
        const rtpHeader = Buffer.alloc(12);
        rtpHeader[0] = 0x80; // V=2, P=0, X=0, CC=0
        rtpHeader[1] = 0x60; // M=0, PT=96 (dynamic payload type for ALAC/PCM)
        rtpHeader.writeUInt16BE(this.#sequenceNumber++, 2); // Sequence number
        rtpHeader.writeUInt32BE(this.#timestamp, 4); // Timestamp
        rtpHeader.writeUInt32BE(0, 8); // SSRC (can be 0 for now)

        // Update timestamp for next packet (assuming 352 frames per packet)
        this.#timestamp += 352;

        const rtpPacket = Buffer.concat([rtpHeader, audioData]);

        // Encrypt if needed
        const data = this.isEncrypted ? this.#encrypt(rtpPacket) : rtpPacket;

        // Send to server audio port
        await new Promise<void>((resolve, reject) => {
            this.#audioSocket!.send(data, this.#serverAudioPort, this.#address, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
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

    #encrypt(data: Buffer): Buffer {
        if (!this.#writeKey) {
            throw new Error('Write key not set');
        }

        const encrypted = Chacha20.encrypt(
            this.#writeKey,
            nonce(this.#encryptionCounter++),
            Buffer.alloc(0), // No AAD for RTP packets
            data
        );

        return Buffer.concat([encrypted.ciphertext, encrypted.authTag]);
    }

    #decrypt(data: Buffer): Buffer {
        if (!this.#readKey) {
            throw new Error('Read key not set');
        }

        if (data.length < 16) {
            throw new Error('Data too short for decryption');
        }

        const ciphertext = data.subarray(0, data.length - 16);
        const authTag = data.subarray(data.length - 16);

        return Chacha20.decrypt(
            this.#readKey,
            nonce(this.#encryptionCounter++),
            Buffer.alloc(0), // No AAD
            ciphertext,
            authTag
        );
    }

    #onAudioData(data: Buffer, info: RemoteInfo): void {
        // Handle incoming audio/control packets if needed
        try {
            if (this.isEncrypted) {
                data = this.#decrypt(data);
            }

            // For now, just log that we received data
            this.context.logger.raw('[audio]', `Received ${data.byteLength} bytes from ${info.address}:${info.port}`);
        } catch (err) {
            this.context.logger.warn('[audio]', 'Failed to process incoming data', err);
        }
    }
}
