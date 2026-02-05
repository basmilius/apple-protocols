/**
 * RTSP Method types used in RAOP
 */
export enum RtspMethod {
  OPTIONS = 'OPTIONS',
  ANNOUNCE = 'ANNOUNCE',
  SETUP = 'SETUP',
  RECORD = 'RECORD',
  PAUSE = 'PAUSE',
  FLUSH = 'FLUSH',
  TEARDOWN = 'TEARDOWN',
  SET_PARAMETER = 'SET_PARAMETER',
  GET_PARAMETER = 'GET_PARAMETER',
}

/**
 * RTSP Response status codes
 */
export enum RtspStatus {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  UNSUPPORTED_MEDIA_TYPE = 415,
  SESSION_NOT_FOUND = 454,
  INTERNAL_SERVER_ERROR = 500,
}

/**
 * RTSP Request structure
 */
export interface RtspRequest {
  method: RtspMethod;
  uri: string;
  headers: Map<string, string>;
  body?: string;
}

/**
 * RTSP Response structure
 */
export interface RtspResponse {
  statusCode: number;
  statusText: string;
  headers: Map<string, string>;
  body?: string;
}

/**
 * Audio format configuration
 */
export interface AudioFormat {
  codec: 'ALAC' | 'PCM' | 'AAC';
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/**
 * Transport configuration for RTP
 */
export interface TransportConfig {
  protocol: 'RTP/AVP/UDP' | 'RTP/AVP/TCP';
  clientPort: number;
  serverPort?: number;
  mode: 'record' | 'play';
}

/**
 * RAOP Session configuration
 */
export interface SessionConfig {
  audioFormat: AudioFormat;
  transport: TransportConfig;
  volume?: number;
}
