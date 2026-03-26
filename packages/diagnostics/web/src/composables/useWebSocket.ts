import { onUnmounted, ref } from 'vue';

export type LogEntry = {
    id: number;
    time: string;
    category: string;
    message: string;
    level: string;
};

let logIdCounter = 0;

export type DeviceInfo = {
    id: string;
    name: string;
    model: string;
    address: string;
    type: 'appletv' | 'homepod' | 'homepod-mini' | 'other';
    protocols: ('airplay' | 'companionLink')[];
    paired: ('airplay' | 'companionLink')[];
};

export type StateSnapshot = {
    connected: boolean;
    device: DeviceInfo | null;
    airplay: { connected: boolean };
    companionLink: { connected: boolean } | null;
    nowPlaying: {
        title: string;
        artist: string;
        album: string;
        duration: number;
        elapsedTime: number;
        playbackState: string;
        artworkUrl: string | null;
        app: string | null;
        bundleIdentifier: string | null;
    };
    volume: {
        level: number;
        available: boolean;
        muted: boolean;
    };
    clients: ClientSnapshot[];
};

export type ClientSnapshot = {
    bundleIdentifier: string;
    displayName: string;
    isActive: boolean;
    playbackState: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    mediaType: string;
    contentIdentifier: string;
    shuffleMode: string;
    repeatMode: string;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    players: PlayerSnapshot[];
};

export type PlayerSnapshot = {
    identifier: string;
    displayName: string;
    isActive: boolean;
    isDefaultPlayer: boolean;
    playbackState: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    seriesName: string;
    seasonNumber: number;
    episodeNumber: number;
    mediaType: string;
    contentIdentifier: string;
    shuffleMode: string;
    repeatMode: string;
    playbackRate: number;
    duration: number;
    elapsedTime: number;
    supportedCommands: string[];
};

const emptyState: StateSnapshot = {
    connected: false,
    device: null,
    airplay: {connected: false},
    companionLink: null,
    nowPlaying: {
        title: '',
        artist: '',
        album: '',
        duration: 0,
        elapsedTime: 0,
        playbackState: 'Unknown',
        artworkUrl: null,
        app: null,
        bundleIdentifier: null
    },
    volume: {level: 0, available: false, muted: false},
    clients: []
};

export type PairingState = {
    active: boolean;
    waitingForPin: boolean;
    protocol: 'airplay' | 'companionLink' | null;
    deviceName: string | null;
    result: { success: boolean; error?: string } | null;
};

export function useWebSocket() {
    const logs = ref<LogEntry[]>([]);
    const state = ref<StateSnapshot>({...emptyState});
    const wsConnected = ref(false);
    const pairing = ref<PairingState>({
        active: false,
        waitingForPin: false,
        protocol: null,
        deviceName: null,
        result: null
    });

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${location.host}/ws`);

        ws.onopen = () => {
            wsConnected.value = true;
        };

        ws.onclose = () => {
            wsConnected.value = false;
            reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'init':
                    logs.value = (data.logs ?? []).map((e: Omit<LogEntry, 'id'>) => ({...e, id: ++logIdCounter}));
                    state.value = data.state ?? {...emptyState};
                    break;

                case 'log':
                    logs.value.push({...data.entry, id: ++logIdCounter});

                    if (logs.value.length > 2000) {
                        logs.value = logs.value.slice(-1500);
                    }

                    break;

                case 'state':
                    state.value = data;
                    break;

                case 'connected':
                    state.value = {...state.value, connected: true, device: data.device ?? null};
                    break;

                case 'disconnected':
                    state.value = {...emptyState};
                    break;

                case 'pairingStarted':
                    pairing.value = {
                        active: true,
                        waitingForPin: false,
                        protocol: data.protocol ?? null,
                        deviceName: data.deviceName ?? null,
                        result: null
                    };
                    break;

                case 'pairingPinRequested':
                    pairing.value = {...pairing.value, waitingForPin: true};
                    break;

                case 'pairingEnded':
                    pairing.value = {
                        ...pairing.value,
                        active: false,
                        waitingForPin: false,
                        result: {success: data.success, error: data.error}
                    };
                    break;
            }
        };
    };

    connect();

    onUnmounted(() => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        ws?.close();
    });

    const clearLogs = () => {
        logs.value = [];
    };

    const dismissPairingResult = () => {
        pairing.value = {...pairing.value, result: null};
    };

    return {logs, state, wsConnected, pairing, clearLogs, dismissPairingResult};
}
