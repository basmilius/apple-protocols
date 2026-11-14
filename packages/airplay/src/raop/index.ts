/// <reference types="node" preserve="true" />
export {
    connect,
    RaopSession
} from './session';

export {
    discover,
    RAOP_SERVICE,
    toTarget
} from './discovery';

export {
    EncryptionType,
    MetadataType
} from './types';

export type {
    MediaMetadata,
    RaopConnectOptions,
    RaopEventMap,
    RaopPlayback,
    RaopPlaybackInfo,
    RaopStreamOptions,
    RaopTarget
} from './types';

export {
    getAudioProperties,
    getEncryptionTypes,
    getMetadataTypes,
    pctToDbfs
} from './utils';
