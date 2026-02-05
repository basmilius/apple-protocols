import type { AudioFormat } from './types';
import type { AesConfig } from './encryption';

/**
 * SDP Builder for RAOP ANNOUNCE command
 * Generates Session Description Protocol content for audio streaming
 */
export class SdpBuilder {
  private audioFormat: AudioFormat;
  private rtpMap: number = 96; // Payload type for ALAC
  private fmtp: string = '';
  private aesConfig?: AesConfig;
  private rsaEncryptedKey?: Buffer;

  constructor(audioFormat: AudioFormat, aesConfig?: AesConfig, rsaEncryptedKey?: Buffer) {
    this.audioFormat = audioFormat;
    this.aesConfig = aesConfig;
    this.rsaEncryptedKey = rsaEncryptedKey;
    this.configureFmtp();
  }

  private configureFmtp(): void {
    // FMTP (Format Parameters) for different codecs
    switch (this.audioFormat.codec) {
      case 'ALAC':
        // ALAC FMTP: frame size, compatible version, bit depth, pb, mb, kb, channels, max run, max frame bytes, avg bit rate, sample rate
        this.fmtp = `96 352 0 16 40 10 14 2 255 0 0 ${this.audioFormat.sampleRate}`;
        this.rtpMap = 96;
        break;
      case 'PCM':
        // PCM is typically L16
        this.rtpMap = this.audioFormat.channels === 2 ? 10 : 11; // 10=L16/2ch, 11=L16/1ch
        this.fmtp = '';
        break;
      case 'AAC':
        this.rtpMap = 97;
        // AAC-LC configuration
        this.fmtp = `97 profile-level-id=15;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3`;
        break;
    }
  }

  build(): string {
    const lines: string[] = [];

    // Version
    lines.push('v=0');

    // Origin: username, session id, version, network type, address type, address
    lines.push(`o=apple-protocols 0 0 IN IP4 127.0.0.1`);

    // Session name
    lines.push('s=RAOP Session');

    // Connection info
    lines.push('c=IN IP4 0.0.0.0');

    // Timing (0 0 means session is permanent)
    lines.push('t=0 0');

    // Media description
    const { sampleRate, channels } = this.audioFormat;
    lines.push(`m=audio 0 RTP/AVP ${this.rtpMap}`);

    // RTP map
    if (this.audioFormat.codec === 'ALAC') {
      lines.push(`a=rtpmap:96 AppleLossless`);
    } else if (this.audioFormat.codec === 'PCM') {
      lines.push(`a=rtpmap:${this.rtpMap} L16/${sampleRate}/${channels}`);
    } else if (this.audioFormat.codec === 'AAC') {
      lines.push(`a=rtpmap:97 mpeg4-generic/${sampleRate}/${channels}`);
    }

    // Format parameters
    if (this.fmtp) {
      lines.push(`a=fmtp:${this.fmtp}`);
    }

    // Encryption parameters (if provided)
    if (this.aesConfig) {
      // rsaaeskey: RSA-encrypted AES key (base64)
      if (this.rsaEncryptedKey) {
        lines.push(`a=rsaaeskey:${this.rsaEncryptedKey.toString('base64')}`);
      }
      // aesiv: AES initialization vector (base64)
      lines.push(`a=aesiv:${this.aesConfig.iv.toString('base64')}`);
    }

    // Additional attributes
    lines.push('a=recvonly'); // We're sending, device is receiving

    return lines.join('\r\n') + '\r\n';
  }

  /**
   * Create default ALAC configuration (most common for RAOP)
   */
  static defaultAlac(): SdpBuilder {
    return new SdpBuilder({
      codec: 'ALAC',
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    });
  }

  /**
   * Create PCM configuration
   */
  static pcm(sampleRate: number = 44100, channels: number = 2): SdpBuilder {
    return new SdpBuilder({
      codec: 'PCM',
      sampleRate,
      channels,
      bitsPerSample: 16,
    });
  }
}
