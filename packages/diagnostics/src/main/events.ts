/** EventEmitter cannot enumerate possible events. Add new protocol events here to forward them to the renderer. */

export const DEVICE_EVENTS = ['status'] as const;

/** The events of `device.nowPlaying`; volume, power and text each have one `change` event. */
export const STATE_EVENTS = ['change', 'state', 'artwork'] as const;

export const AIRPLAY_STATE_EVENTS = [
    'activePlayerChanged',
    'artworkChanged',
    'clients',
    'clusterChanged',
    'keyboardChanged',
    'lyricsEvent',
    'nowPlayingChanged',
    'outputDevicesChanged',
    'participantsChanged',
    'playbackQueueChanged',
    'playbackStateChanged',
    'supportedCommandsChanged',
    'volumeChanged',
    'volumeControlChanged',
    'volumeMutedChanged'
] as const;

export const DATA_STREAM_EVENTS = [
    'rawMessage',
    'configureConnection',
    'deviceInfo',
    'deviceInfoUpdate',
    'keyboard',
    'originClientProperties',
    'playerClientProperties',
    'removeClient',
    'removePlayer',
    'sendCommandResult',
    'sendLyricsEvent',
    'setArtwork',
    'setDefaultSupportedCommands',
    'setNowPlayingClient',
    'setNowPlayingPlayer',
    'setState',
    'updateClient',
    'updateContentItem',
    'updateContentItemArtwork',
    'updatePlayer',
    'updateOutputDevice',
    'playerClientParticipantsUpdate',
    'volumeControlAvailability',
    'volumeControlCapabilitiesDidChange',
    'volumeDidChange',
    'volumeMutedDidChange',
    'audioFade',
    'audioFadeResponse',
    'adjustVolume',
    'getVolumeResult',
    'getVolumeMutedResult',
    'notification',
    'setConnectionState',
    'setDiscoveryMode',
    'setListeningMode',
    'transaction',
    'updateActiveSystemEndpoint',
    'updateEndpoints',
    'removeEndpoints',
    'removeOutputDevices',
    'wakeDevice',
    'genericMessage',
    'playbackSessionRequest',
    'playbackSessionResponse',
    'playbackSessionMigrateRequest',
    'playbackSessionMigrateResponse',
    'playbackSessionMigrateBegin',
    'playbackSessionMigrateEnd',
    'playbackSessionMigratePost',
    'createHostedEndpointRequest',
    'createHostedEndpointResponse',
    'promptForRouteAuthorization',
    'promptForRouteAuthorizationResponse',
    'presentRouteAuthorizationStatus',
    'requestGroupSession',
    'microphoneConnectionRequest',
    'microphoneConnectionResponse',
    'createApplicationConnection',
    'setHiliteMode',
    'textInput',
    'remoteTextInput',
    'cryptoPairing',
    'gameController',
    'gameControllerProperties',
    'registerGameController',
    'registerGameControllerResponse'
] as const;

export const EVENT_STREAM_EVENTS = ['command', 'duckAudio', 'unduckAudio', 'sessionDied'] as const;

/** The events of the Companion Link model. */
export const COMPANION_LINK_EVENTS = [
    'attentionStateChanged',
    'mediaControlFlagsChanged',
    'nowPlayingInfoChanged',
    'supportedActionsChanged',
    'textInputChanged',
    'volumeAvailabilityChanged'
] as const;

export const ARTWORK_EVENTS: readonly string[] = ['artworkChanged', 'nowPlayingChanged', 'setArtwork', 'updateContentItemArtwork', 'nowPlaying.artwork', 'nowPlaying.change'];
