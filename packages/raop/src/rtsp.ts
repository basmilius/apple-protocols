import { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { RtspMethod, type RtspRequest, type RtspResponse, RtspStatus } from './types';

/**
 * RTSP Client for RAOP communication
 * Handles RTSP protocol request/response cycle with Apple-specific headers
 */
export class RtspClient {
  private socket: Socket;
  private sequenceNumber = 1;
  private sessionId: string | null = null;
  private responseBuffer = '';
  private pendingResponses: Map<number, (response: RtspResponse) => void> = new Map();
  
  // Apple-specific identifiers
  private clientInstance: string;
  private dacpId: string;
  private activeRemote: string;

  constructor(socket: Socket) {
    this.socket = socket;
    
    // Generate unique identifiers for this client session
    this.clientInstance = randomBytes(8).toString('hex').toUpperCase();
    this.dacpId = randomBytes(8).toString('hex').toUpperCase();
    this.activeRemote = randomBytes(4).readUInt32BE(0).toString();
    
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.socket.on('data', (data: Buffer) => {
      this.responseBuffer += data.toString();
      this.processResponses();
    });
  }

  private processResponses(): void {
    while (true) {
      const headerEndIndex = this.responseBuffer.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) break;

      const headerSection = this.responseBuffer.substring(0, headerEndIndex);
      const lines = headerSection.split('\r\n');
      
      // Parse status line
      const statusLine = lines[0];
      const statusMatch = statusLine.match(/RTSP\/1\.0 (\d+) (.+)/);
      if (!statusMatch) break;

      const statusCode = parseInt(statusMatch[1]);
      const statusText = statusMatch[2];

      // Parse headers
      const headers = new Map<string, string>();
      let contentLength = 0;

      for (let i = 1; i < lines.length; i++) {
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = lines[i].substring(0, colonIndex).trim();
        const value = lines[i].substring(colonIndex + 1).trim();
        headers.set(key, value);

        if (key.toLowerCase() === 'content-length') {
          contentLength = parseInt(value);
        }
        if (key === 'Session') {
          this.sessionId = value;
        }
      }

      // Check if we have the full body
      const bodyStartIndex = headerEndIndex + 4;
      if (this.responseBuffer.length < bodyStartIndex + contentLength) break;

      const body = contentLength > 0 
        ? this.responseBuffer.substring(bodyStartIndex, bodyStartIndex + contentLength)
        : undefined;

      // Remove processed response from buffer
      this.responseBuffer = this.responseBuffer.substring(bodyStartIndex + contentLength);

      // Build response object
      const response: RtspResponse = {
        statusCode,
        statusText,
        headers,
        body,
      };

      // Find and resolve pending request
      const cseq = headers.get('CSeq');
      if (cseq) {
        const resolver = this.pendingResponses.get(parseInt(cseq));
        if (resolver) {
          resolver(response);
          this.pendingResponses.delete(parseInt(cseq));
        }
      }
    }
  }

  async sendRequest(request: RtspRequest): Promise<RtspResponse> {
    const cseq = this.sequenceNumber++;
    
    // Build request string
    let requestStr = `${request.method} ${request.uri} RTSP/1.0\r\n`;
    requestStr += `CSeq: ${cseq}\r\n`;
    
    // Add Apple-specific headers for compatibility with HomePods and Apple TVs
    requestStr += `Client-Instance: ${this.clientInstance}\r\n`;
    requestStr += `DACP-ID: ${this.dacpId}\r\n`;
    requestStr += `Active-Remote: ${this.activeRemote}\r\n`;
    
    if (this.sessionId && request.method !== RtspMethod.SETUP) {
      requestStr += `Session: ${this.sessionId}\r\n`;
    }

    // Add custom headers
    for (const [key, value] of request.headers) {
      requestStr += `${key}: ${value}\r\n`;
    }

    // Add content
    if (request.body) {
      requestStr += `Content-Length: ${request.body.length}\r\n`;
      requestStr += '\r\n';
      requestStr += request.body;
    } else {
      requestStr += '\r\n';
    }

    // Send request
    this.socket.write(requestStr);

    // Wait for response
    return new Promise((resolve) => {
      this.pendingResponses.set(cseq, resolve);
    });
  }

  async options(uri: string): Promise<RtspResponse> {
    return this.sendRequest({
      method: RtspMethod.OPTIONS,
      uri,
      headers: new Map([
        ['User-Agent', 'AirPlay/320.20'],
      ]),
    });
  }

  async announce(uri: string, sdpContent: string): Promise<RtspResponse> {
    return this.sendRequest({
      method: RtspMethod.ANNOUNCE,
      uri,
      headers: new Map([
        ['User-Agent', 'AirPlay/320.20'],
        ['Content-Type', 'application/sdp'],
      ]),
      body: sdpContent,
    });
  }

  async setup(uri: string, transport: string): Promise<RtspResponse> {
    return this.sendRequest({
      method: RtspMethod.SETUP,
      uri,
      headers: new Map([
        ['User-Agent', 'AirPlay/320.20'],
        ['Transport', transport],
      ]),
    });
  }

  async record(uri: string, rtpInfo?: string): Promise<RtspResponse> {
    const headers = new Map([
      ['User-Agent', 'AirPlay/320.20'],
      ['Range', 'npt=0-'],
    ]);

    if (rtpInfo) {
      headers.set('RTP-Info', rtpInfo);
    }

    return this.sendRequest({
      method: RtspMethod.RECORD,
      uri,
      headers,
    });
  }

  async setParameter(uri: string, parameter: string, value: string): Promise<RtspResponse> {
    return this.sendRequest({
      method: RtspMethod.SET_PARAMETER,
      uri,
      headers: new Map([
        ['User-Agent', 'AirPlay/320.20'],
        ['Content-Type', 'text/parameters'],
      ]),
      body: `${parameter}: ${value}\r\n`,
    });
  }

  async teardown(uri: string): Promise<RtspResponse> {
    return this.sendRequest({
      method: RtspMethod.TEARDOWN,
      uri,
      headers: new Map([
        ['User-Agent', 'AirPlay/320.20'],
      ]),
    });
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getNextSequenceNumber(): number {
    return this.sequenceNumber;
  }
}
