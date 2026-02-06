import type { Socket as UdpSocket } from 'node:dgram';

export interface MediaMetadata {
    title: string;
    artist: string;
    album: string;
    duration: number;
    artwork?: Buffer;
}

export interface PlaybackInfo {
    metadata: MediaMetadata;
    position: number;
}

export interface StreamContext {
    sampleRate: number;
    channels: number;
    bytesPerChannel: number;
    rtpseq: number;
    rtptime: number;
    headTs: number;
    latency: number;
    serverPort: number;
    controlPort: number;
    rtspSession: string;
    volume: number;
    position: number;
    packetSize: number;
    frameSize: number;
    paddingSent: number;

    reset(): void;
}

export interface StreamProtocol {
    setup(timingPort: number, controlPort: number): Promise<void>;
    startFeedback(): Promise<void>;
    sendAudioPacket(transport: UdpSocket, header: Buffer, audio: Buffer): Promise<[number, Buffer]>;
    teardown(): void;
}

export interface Settings {
    protocols: {
        raop: {
            controlPort: number;
            timingPort: number;
        };
    };
}

export enum EncryptionType {
    Unknown = 0,
    Unencrypted = 1 << 0,
    MFiSAP = 1 << 1
}

export enum MetadataType {
    NotSupported = 0,
    Text = 1 << 0,
    Artwork = 1 << 1,
    Progress = 1 << 2
}

export interface RaopListener {
    playing(playbackInfo: PlaybackInfo): void;
    stopped(): void;
}
