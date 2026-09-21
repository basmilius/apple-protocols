/**
 * The event names each source emits. `EventEmitter` cannot be asked what it can emit, so the
 * forwarder walks these lists; a name added to a protocol package has to be added here too before
 * the renderer sees it.
 */

export const DEVICE_EVENTS = ['connected', 'disconnected', 'recovering', 'recoveryFailed', 'power', 'textInput'] as const;

export const STATE_EVENTS = [
    'nowPlayingChanged',
    'playbackStateChanged',
    'volumeChanged',
    'volumeMutedChanged',
    'artworkChanged',
    'activeAppChanged',
    'supportedCommandsChanged',
    'clusterChanged'
] as const;

export const AIRPLAY_STATE_EVENTS = [
    'clients',
    'configureConnection',
    'deviceInfo',
    'deviceInfoUpdate',
    'keyboard',
    'nowPlayingChanged',
    'originClientProperties',
    'playerClientProperties',
    'removeClient',
    'removePlayer',
    'sendCommandResult',
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
    'volumeControlAvailability',
    'volumeControlCapabilitiesDidChange',
    'volumeDidChange',
    'volumeMutedDidChange',
    'activePlayerChanged',
    'artworkChanged',
    'lyricsEvent',
    'playbackQueueChanged',
    'playbackStateChanged',
    'supportedCommandsChanged',
    'clusterChanged',
    'playerClientParticipantsUpdate'
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

export const COMPANION_LINK_EVENTS = [
    'connected',
    'disconnected',
    'attentionStateChanged',
    'mediaControlFlagsChanged',
    'nowPlayingInfoChanged',
    'supportedActionsChanged',
    'textInputChanged',
    'volumeAvailabilityChanged'
] as const;

/** The events after which the artwork is worth resolving again. */
export const ARTWORK_EVENTS: readonly string[] = ['artworkChanged', 'nowPlayingChanged', 'setArtwork', 'updateContentItemArtwork'];
