import { Socket } from 'node:net';
import { createSocket, type Socket as DgramSocket } from 'node:dgram';
import { randomBytes } from 'node:crypto';
import type { DiscoveryResult } from '@basmilius/apple-common';
import { getLocalIP } from '@basmilius/apple-common';
import { RtspClient } from './rtsp';
import { SdpBuilder } from './sdp';
import { RtpStream } from './rtp';
import type { AudioFormat, SessionConfig } from './types';
import { 
  generateAesConfig, 
  encryptAesKey, 
  createAesCipher,
  getEncryptionType,
  AIRPORT_RSA_PUBLIC_KEY,
  type AesConfig 
} from './encryption';

/**
 * RAOP Audio Session - manages RTSP control and RTP audio streaming with optional encryption
 * Implementation based on pyatv for maximum compatibility
 */
export class RaopSession {
  private controlSocket: Socket | null = null;
  private audioSocket: DgramSocket | null = null;
  private rtspClient: RtspClient | null = null;
  private rtpStream: RtpStream | null = null;
  
  private readonly targetHost: string;
  private readonly targetPort: number;
  private audioPort: number = 0;
  private serverAudioPort: number = 0;
  
  // Session ID (matching pyatv: random 32-bit integer)
  private readonly raopSessionId: number;
  
  // RTSP session ID from SETUP response
  private rtspSessionId: number | null = null;
  
  // Local IP for URI (cached)
  private localIp: string | null = null;
  
  // Encryption support
  private aesConfig: AesConfig | null = null;
  private aesCipher: ReturnType<typeof createAesCipher> | null = null;
  private encryptionEnabled: boolean = false;
  
  readonly deviceInfo: DiscoveryResult;
  private sessionConfig: SessionConfig | null = null;

  constructor(device: DiscoveryResult) {
    this.deviceInfo = device;
    this.targetHost = device.address;
    this.targetPort = device.service.port;
    
    // Generate random 32-bit session ID (matching pyatv)
    this.raopSessionId = randomBytes(4).readUInt32BE(0);
    
    // Check if device requires encryption
    const encType = getEncryptionType(device.txt || {});
    this.encryptionEnabled = encType !== 'none';
  }

  /**
   * Establish RTSP control connection
   */
  async establish(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.controlSocket = new Socket();
      
      const handleError = (error: Error) => {
        this.controlSocket?.removeListener('connect', handleConnect);
        reject(error);
      };
      
      const handleConnect = () => {
        this.controlSocket?.removeListener('error', handleError);
        this.rtspClient = new RtspClient(this.controlSocket!);
        resolve();
      };
      
      this.controlSocket.once('error', handleError);
      this.controlSocket.once('connect', handleConnect);
      
      this.controlSocket.connect(this.targetPort, this.targetHost);
    });
  }

  /**
   * Perform RTSP handshake: OPTIONS, ANNOUNCE, SETUP
   */
  async setupSession(audioFormat?: AudioFormat, enableEncryption?: boolean): Promise<void> {
    if (!this.rtspClient) {
      throw new Error('RTSP client not established. Call establish() first.');
    }

    const format = audioFormat || {
      codec: 'ALAC',
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    };

    // CRITICAL: pyatv uses LOCAL IP in URI, not remote host!
    const localIp = await getLocalIP();
    const rtspUrl = `rtsp://${localIp}/${this.raopSessionId}`;

    // Step 1: OPTIONS - Query supported methods
    const optionsResponse = await this.rtspClient.options(rtspUrl);
    if (optionsResponse.statusCode !== 200) {
      throw new Error(`OPTIONS failed: ${optionsResponse.statusCode} ${optionsResponse.statusText}`);
    }

    // Step 1.5: Setup encryption if needed
    let rsaEncryptedKey: Buffer | undefined;
    if (enableEncryption !== false && this.encryptionEnabled) {
      this.aesConfig = generateAesConfig();
      
      // Encrypt AES key with RSA public key
      rsaEncryptedKey = encryptAesKey(this.aesConfig.key, AIRPORT_RSA_PUBLIC_KEY);
      
      // Create cipher for audio encryption
      this.aesCipher = createAesCipher(this.aesConfig);
    }

    // Step 2: ANNOUNCE - Declare audio format (with encryption if enabled)
    const sdp = new SdpBuilder(
      format, 
      this.raopSessionId, 
      localIp,                // Local IP for origin
      this.targetHost,        // Remote IP for connection
      this.aesConfig ?? undefined, 
      rsaEncryptedKey
    ).build();
    const announceResponse = await this.rtspClient.announce(rtspUrl, sdp);
    if (announceResponse.statusCode !== 200) {
      throw new Error(`ANNOUNCE failed: ${announceResponse.statusCode} ${announceResponse.statusText}`);
    }

    // Step 3: Create UDP sockets for audio, timing, and control
    this.audioSocket = createSocket('udp4');
    await new Promise<void>((resolve) => {
      this.audioSocket!.bind(0, () => {
        this.audioPort = this.audioSocket!.address().port;
        resolve();
      });
    });

    // Create timing and control ports (required by pyatv)
    const timingSocket = createSocket('udp4');
    const timingPort = await new Promise<number>((resolve) => {
      timingSocket.bind(0, () => {
        const port = timingSocket.address().port;
        timingSocket.close();
        resolve(port);
      });
    });

    const controlSocket = createSocket('udp4');
    const controlPort = await new Promise<number>((resolve) => {
      controlSocket.bind(0, () => {
        const port = controlSocket.address().port;
        controlSocket.close();
        resolve(port);
      });
    });

    // Step 4: SETUP - Configure transport with all ports
    // Format matches pyatv exactly
    const transport = `RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=${controlPort};timing_port=${timingPort}`;
    const setupResponse = await this.rtspClient.setup(rtspUrl, transport);
    if (setupResponse.statusCode !== 200) {
      throw new Error(`SETUP failed: ${setupResponse.statusCode} ${setupResponse.statusText}`);
    }

    // Parse SETUP response (matching pyatv)
    // Extract RTSP Session ID
    const sessionHeader = setupResponse.headers.get('Session');
    if (sessionHeader) {
      this.rtspSessionId = parseInt(sessionHeader);
    }

    // Parse server port from Transport header
    const transportHeader = setupResponse.headers.get('Transport');
    if (transportHeader) {
      const serverPortMatch = transportHeader.match(/server_port=(\d+)/);
      if (serverPortMatch) {
        this.serverAudioPort = parseInt(serverPortMatch[1]);
      }
    }

    // Initialize RTP stream
    this.rtpStream = new RtpStream(format.sampleRate);

    this.sessionConfig = {
      audioFormat: format,
      transport: {
        protocol: 'RTP/AVP/UDP',
        clientPort: this.audioPort,
        serverPort: this.serverAudioPort,
        mode: 'record',
      },
    };
    
    // Cache local IP for later use
    this.localIp = localIp;
  }

  /**
   * Start audio playback
   */
  async startPlayback(): Promise<void> {
    if (!this.rtspClient || !this.localIp) {
      throw new Error('Session not established');
    }

    const rtspUrl = `rtsp://${this.localIp}/${this.raopSessionId}`;
    const rtpInfo = `seq=${this.rtpStream!.getSequenceNumber()};rtptime=${this.rtpStream!.getTimestamp()}`;
    
    const recordResponse = await this.rtspClient.record(rtspUrl, rtpInfo);
    if (recordResponse.statusCode !== 200) {
      throw new Error(`RECORD failed: ${recordResponse.statusCode} ${recordResponse.statusText}`);
    }
  }

  /**
   * Send audio data as RTP packet (with optional encryption)
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.rtpStream || !this.audioSocket || !this.serverAudioPort) {
      throw new Error('Session not fully configured');
    }

    // Encrypt audio data if encryption is enabled
    let payload = audioData;
    if (this.aesCipher) {
      payload = this.aesCipher.encrypt(audioData);
    }

    const packet = this.rtpStream.createPacket(payload);
    const buffer = packet.toBuffer();

    return new Promise((resolve, reject) => {
      this.audioSocket!.send(buffer, this.serverAudioPort, this.targetHost, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Set volume (0.0 to 1.0)
   * 
   * RAOP devices support volume range from -144 to 0 dB (or -30 to 0 dB on some devices).
   * This method uses the -30 to 0 range which is more commonly supported.
   * For full range support, adjust the scaling factor as needed.
   */
  async setVolume(volume: number): Promise<void> {
    if (!this.rtspClient || !this.localIp) {
      throw new Error('Session not established');
    }

    // Convert to RAOP volume scale: -30 dB (quiet) to 0 dB (max)
    // Some devices support -144 to 0, but -30 to 0 is more widely compatible
    const raopVolume = -30 + (volume * 30);
    const rtspUrl = `rtsp://${this.localIp}/${this.raopSessionId}`;
    
    await this.rtspClient.setParameter(rtspUrl, 'volume', raopVolume.toFixed(6));
  }

  /**
   * Stop playback and close session
   */
  async teardown(): Promise<void> {
    if (this.rtspClient && this.localIp) {
      try {
        const rtspUrl = `rtsp://${this.localIp}/${this.raopSessionId}`;
        await this.rtspClient.teardown(rtspUrl);
      } catch (error) {
        console.warn('Error during RTSP teardown:', error);
      }
    }

    if (this.audioSocket) {
      try {
        this.audioSocket.close();
      } catch (error) {
        console.warn('Error closing audio socket:', error);
      }
      this.audioSocket = null;
    }

    if (this.controlSocket) {
      try {
        this.controlSocket.destroy();
      } catch (error) {
        console.warn('Error during socket teardown:', error);
      } finally {
        this.controlSocket = null;
      }
    }

    this.rtspClient = null;
    this.rtpStream = null;
    this.sessionConfig = null;
    this.aesCipher = null;
    this.aesConfig = null;
  }

  isActive(): boolean {
    return this.controlSocket !== null && !this.controlSocket.destroyed;
  }

  getDeviceIdentifier(): string {
    return this.deviceInfo.id;
  }

  getSessionConfig(): SessionConfig | null {
    return this.sessionConfig;
  }

  /**
   * Check if encryption is enabled for this session
   */
  isEncryptionEnabled(): boolean {
    return this.encryptionEnabled && this.aesCipher !== null;
  }
}
