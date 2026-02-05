import { randomBytes } from 'node:crypto';

/**
 * RTP (Real-time Transport Protocol) Packet Structure
 * Used for audio data streaming in RAOP
 */
export class RtpPacket {
  // RTP Header fields
  version: number = 2; // RTP version (always 2)
  padding: boolean = false;
  extension: boolean = false;
  csrcCount: number = 0;
  marker: boolean = false;
  payloadType: number = 96; // ALAC payload type
  sequenceNumber: number;
  timestamp: number;
  ssrc: number; // Synchronization source identifier
  
  // Payload
  payload: Buffer;

  constructor(sequenceNumber: number, timestamp: number, ssrc: number, payload: Buffer) {
    this.sequenceNumber = sequenceNumber;
    this.timestamp = timestamp;
    this.ssrc = ssrc;
    this.payload = payload;
  }

  /**
   * Serialize RTP packet to buffer for transmission
   */
  toBuffer(): Buffer {
    const headerSize = 12; // Fixed header size
    const buffer = Buffer.allocUnsafe(headerSize + this.payload.length);

    // Byte 0: Version (2 bits), Padding (1 bit), Extension (1 bit), CSRC count (4 bits)
    buffer[0] = (this.version << 6) | 
                (this.padding ? 0x20 : 0) | 
                (this.extension ? 0x10 : 0) | 
                (this.csrcCount & 0x0F);

    // Byte 1: Marker (1 bit), Payload type (7 bits)
    buffer[1] = (this.marker ? 0x80 : 0) | (this.payloadType & 0x7F);

    // Bytes 2-3: Sequence number
    buffer.writeUInt16BE(this.sequenceNumber, 2);

    // Bytes 4-7: Timestamp
    buffer.writeUInt32BE(this.timestamp, 4);

    // Bytes 8-11: SSRC
    buffer.writeUInt32BE(this.ssrc, 8);

    // Payload
    this.payload.copy(buffer, headerSize);

    return buffer;
  }

  /**
   * Parse RTP packet from buffer
   */
  static fromBuffer(buffer: Buffer): RtpPacket {
    if (buffer.length < 12) {
      throw new Error('Buffer too small for RTP packet');
    }

    const version = (buffer[0] >> 6) & 0x03;
    const padding = (buffer[0] & 0x20) !== 0;
    const extension = (buffer[0] & 0x10) !== 0;
    const csrcCount = buffer[0] & 0x0F;

    const marker = (buffer[1] & 0x80) !== 0;
    const payloadType = buffer[1] & 0x7F;

    const sequenceNumber = buffer.readUInt16BE(2);
    const timestamp = buffer.readUInt32BE(4);
    const ssrc = buffer.readUInt32BE(8);

    const headerSize = 12 + (csrcCount * 4);
    const payload = buffer.slice(headerSize);

    const packet = new RtpPacket(sequenceNumber, timestamp, ssrc, payload);
    packet.version = version;
    packet.padding = padding;
    packet.extension = extension;
    packet.csrcCount = csrcCount;
    packet.marker = marker;
    packet.payloadType = payloadType;

    return packet;
  }
}

/**
 * RTP Stream Manager
 * Manages RTP packet sequencing and timing
 */
export class RtpStream {
  private sequenceNumber: number;
  private timestamp: number;
  private ssrc: number;
  private readonly sampleRate: number;

  constructor(sampleRate: number = 44100) {
    this.sequenceNumber = Math.floor(Math.random() * 0xFFFF);
    this.timestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    this.ssrc = randomBytes(4).readUInt32BE(0);
    this.sampleRate = sampleRate;
  }

  /**
   * Create next RTP packet with audio data
   */
  createPacket(audioData: Buffer, samplesPerFrame: number = 352): RtpPacket {
    const packet = new RtpPacket(
      this.sequenceNumber,
      this.timestamp,
      this.ssrc,
      audioData
    );

    // Increment for next packet
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xFFFF;
    this.timestamp = (this.timestamp + samplesPerFrame) & 0xFFFFFFFF;

    return packet;
  }

  /**
   * Get current SSRC
   */
  getSsrc(): number {
    return this.ssrc;
  }

  /**
   * Get current sequence number
   */
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  /**
   * Get current timestamp
   */
  getTimestamp(): number {
    return this.timestamp;
  }

  /**
   * Reset stream state
   */
  reset(): void {
    this.sequenceNumber = Math.floor(Math.random() * 0xFFFF);
    this.timestamp = Math.floor(Math.random() * 0xFFFFFFFF);
  }
}
