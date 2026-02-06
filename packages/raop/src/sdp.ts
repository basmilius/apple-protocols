import type { AudioFormat } from './types';
import type { AesConfig } from './encryption';

/**
 * SDP Builder for RAOP ANNOUNCE command
 * Generates Session Description Protocol content for audio streaming
 * Format based on pyatv for maximum compatibility
 */
export class SdpBuilder {
  private audioFormat: AudioFormat;
  private rtpMap: number = 96; // Payload type for ALAC
  private fmtp: string = '';
  private aesConfig?: AesConfig;
  private rsaEncryptedKey?: Buffer;
  private sessionId: number;
  private localIp: string;
  private remoteIp: string;

  constructor(
    audioFormat: AudioFormat, 
    sessionId: number,
    localIp: string,
    remoteIp: string,
    aesConfig?: AesConfig, 
    rsaEncryptedKey?: Buffer
  ) {
    this.audioFormat = audioFormat;
    this.sessionId = sessionId;
    this.localIp = localIp;
    this.remoteIp = remoteIp;
    this.aesConfig = aesConfig;
    this.rsaEncryptedKey = rsaEncryptedKey;
    this.configureFmtp();
  }

  private configureFmtp(): void {
    // IMPORTANT: Match pyatv's EXACT format!
    // Apple devices expect this specific format regardless of actual codec.
    // pyatv uses: "a=rtpmap:96 L16/44100/2" with ALAC fmtp parameters
    // This is Apple's quirk - rtpmap says L16 but fmtp has ALAC-style params
    
    const { bitsPerSample = 16, channels = 2, sampleRate = 44100 } = this.audioFormat;
    
    // Always use payload type 96 (matching pyatv)
    this.rtpMap = 96;
    
    // ALAC-style FMTP format (matching pyatv):
    // Format: {payload} {frames_per_packet} {compat_version} {bit_depth} {pb} {mb} {kb} {channels} {max_run} {max_frame_bytes} {avg_bit_rate} {sample_rate}
    // pyatv uses: "96 352 0 16 40 10 14 2 255 0 0 44100"
    const framesPerPacket = 352; // Standard ALAC frames per packet
    this.fmtp = `96 ${framesPerPacket} 0 ${bitsPerSample} 40 10 14 ${channels} 255 0 0 ${sampleRate}`;
  }

  build(): string {
    const lines: string[] = [];

    // Version
    lines.push('v=0');

    // Origin: username, session id, version, network type, address type, address
    // Matching pyatv format: o=iTunes {session_id} 0 IN IP4 {local_ip}
    lines.push(`o=iTunes ${this.sessionId} 0 IN IP4 ${this.localIp}`);

    // Session name (matching pyatv)
    lines.push('s=iTunes');

    // Connection info (matching pyatv format with remote IP)
    lines.push(`c=IN IP4 ${this.remoteIp}`);

    // Timing (0 0 means session is permanent)
    lines.push('t=0 0');

    // Media description (matching pyatv exactly)
    lines.push(`m=audio 0 RTP/AVP 96`);

    // RTP map - IMPORTANT: Always use "L16/44100/2" like pyatv, regardless of actual format!
    // This is what Apple devices expect. The actual format is in fmtp.
    // Note: If audioFormat differs significantly from 44100/2, log a warning
    const { sampleRate, channels } = this.audioFormat;
    if (sampleRate !== 44100 || channels !== 2) {
      console.warn(`⚠️  SDP rtpmap is hardcoded to L16/44100/2 but audioFormat is ${sampleRate}/${channels}`);
      console.warn(`   Apple devices expect this format. Actual params are in fmtp.`);
    }
    lines.push(`a=rtpmap:96 L16/44100/2`);

    // Format parameters (ALAC-style format with actual audio parameters)
    lines.push(`a=fmtp:${this.fmtp}`);

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
  static defaultAlac(sessionId: number, localIp: string, remoteIp: string): SdpBuilder {
    return new SdpBuilder(
      {
        codec: 'ALAC',
        sampleRate: 44100,
        channels: 2,
        bitsPerSample: 16,
      },
      sessionId,
      localIp,
      remoteIp
    );
  }

  /**
   * Create PCM configuration
   */
  static pcm(sessionId: number, localIp: string, remoteIp: string, sampleRate: number = 44100, channels: number = 2): SdpBuilder {
    return new SdpBuilder(
      {
        codec: 'PCM',
        sampleRate,
        channels,
        bitsPerSample: 16,
      },
      sessionId,
      localIp,
      remoteIp
    );
  }
}
