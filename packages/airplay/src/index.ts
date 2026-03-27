export { default as AudioMultiplexer } from './audioMultiplexer';
export { default as AudioStream, type AudioStreamOptions, type AudioStreamStats } from './audioStream';
export { default as ControlStream } from './controlStream';
export { default as DataStream } from './dataStream';
export { default as EventStream, type EventStreamEventMap } from './eventStream';
export { AirPlayFeature, SENDER_FEATURES_REMOTE_CONTROL, SENDER_FEATURES_AUDIO, hasFeature, decodeFeatures } from './features';
export { default as LatencyManager } from './latencyManager';
export { Pairing, Verify } from './pairing';
export { default as Protocol, type PlaybackInfo } from './protocol';

export * as DataStreamMessage from './dataStreamMessages';
export * as Proto from './proto';
