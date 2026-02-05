import { Socket } from 'node:net';
import { createSocket, type Socket as DgramSocket } from 'node:dgram';
import type { DiscoveryResult } from '@basmilius/apple-common';
import { RtspClient } from './rtsp';
import { SdpBuilder } from './sdp';
import { RtpStream } from './rtp';
import type { AudioFormat, SessionConfig } from './types';

/**
 * RAOP Audio Session - manages RTSP control and RTP audio streaming
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
  
  readonly deviceInfo: DiscoveryResult;
  private sessionConfig: SessionConfig | null = null;

  constructor(device: DiscoveryResult) {
    this.deviceInfo = device;
    this.targetHost = device.address;
    this.targetPort = device.service.port;
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
  async setupSession(audioFormat?: AudioFormat): Promise<void> {
    if (!this.rtspClient) {
      throw new Error('RTSP client not established. Call establish() first.');
    }

    const format = audioFormat || {
      codec: 'ALAC',
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    };

    const rtspUrl = `rtsp://${this.targetHost}/${this.deviceInfo.id}`;

    // Step 1: OPTIONS - Query supported methods
    const optionsResponse = await this.rtspClient.options(rtspUrl);
    if (optionsResponse.statusCode !== 200) {
      throw new Error(`OPTIONS failed: ${optionsResponse.statusCode}`);
    }

    // Step 2: ANNOUNCE - Declare audio format
    const sdp = new SdpBuilder(format).build();
    const announceResponse = await this.rtspClient.announce(rtspUrl, sdp);
    if (announceResponse.statusCode !== 200) {
      throw new Error(`ANNOUNCE failed: ${announceResponse.statusCode}`);
    }

    // Step 3: Create UDP socket for audio
    this.audioSocket = createSocket('udp4');
    await new Promise<void>((resolve) => {
      this.audioSocket!.bind(0, () => {
        this.audioPort = this.audioSocket!.address().port;
        resolve();
      });
    });

    // Step 4: SETUP - Configure transport
    const transport = `RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;control_port=0;timing_port=0;client_port=${this.audioPort}`;
    const setupResponse = await this.rtspClient.setup(rtspUrl, transport);
    if (setupResponse.statusCode !== 200) {
      throw new Error(`SETUP failed: ${setupResponse.statusCode}`);
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
  }

  /**
   * Start audio playback
   */
  async startPlayback(): Promise<void> {
    if (!this.rtspClient) {
      throw new Error('Session not established');
    }

    const rtspUrl = `rtsp://${this.targetHost}/${this.deviceInfo.id}`;
    const rtpInfo = `seq=${this.rtpStream!.getSequenceNumber()};rtptime=${this.rtpStream!.getTimestamp()}`;
    
    const recordResponse = await this.rtspClient.record(rtspUrl, rtpInfo);
    if (recordResponse.statusCode !== 200) {
      throw new Error(`RECORD failed: ${recordResponse.statusCode}`);
    }
  }

  /**
   * Send audio data as RTP packet
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.rtpStream || !this.audioSocket || !this.serverAudioPort) {
      throw new Error('Session not fully configured');
    }

    const packet = this.rtpStream.createPacket(audioData);
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
   */
  async setVolume(volume: number): Promise<void> {
    if (!this.rtspClient) {
      throw new Error('Session not established');
    }

    // Convert to RAOP volume scale (-144 to 0, or -30 to 0 for some devices)
    const raopVolume = -30 + (volume * 30);
    const rtspUrl = `rtsp://${this.targetHost}/${this.deviceInfo.id}`;
    
    await this.rtspClient.setParameter(rtspUrl, 'volume', raopVolume.toFixed(6));
  }

  /**
   * Stop playback and close session
   */
  async teardown(): Promise<void> {
    if (this.rtspClient) {
      try {
        const rtspUrl = `rtsp://${this.targetHost}/${this.deviceInfo.id}`;
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
}
