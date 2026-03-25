<template>
    <div class="sidebar-section sidebar-section-fill">
        <div class="section-header">
            <h3>State</h3>
        </div>

        <div
            v-if="state.connected"
            class="section-body">
            <!-- Connection -->
            <div class="state-section">
                <h4>Connection</h4>
                <div class="state-row">
                    <span class="state-label">AirPlay</span>
                    <span class="state-value">
                        <span
                            class="status-dot"
                            :class="state.airplay.connected ? 'connected' : 'disconnected'"/>
                    </span>
                </div>
                <div
                    v-if="state.companionLink"
                    class="state-row">
                    <span class="state-label">Companion Link</span>
                    <span class="state-value">
                        <span
                            class="status-dot"
                            :class="state.companionLink.connected ? 'connected' : 'disconnected'"/>
                    </span>
                </div>
            </div>

            <!-- Volume -->
            <div class="state-section">
                <h4>Volume</h4>
                <div class="state-row">
                    <span class="state-label">Level</span>
                    <span class="state-value">{{ state.volume.level }}%</span>
                </div>
                <div class="state-row">
                    <span class="state-label">Muted</span>
                    <span class="state-value">{{ state.volume.muted ? 'Yes' : 'No' }}</span>
                </div>
            </div>

            <!-- Clients -->
            <div
                v-if="state.clients.length > 0"
                class="state-section">
                <h4>Clients ({{ state.clients.length }})</h4>
                <div
                    v-for="client in state.clients"
                    :key="client.bundleIdentifier"
                    class="client-entry"
                    :class="{active: client.isActive}">
                    <div class="client-name">{{ client.displayName }}</div>
                    <div class="client-meta">
                        {{ client.bundleIdentifier }} &middot; {{ client.playbackState }}
                    </div>

                    <div
                        v-for="player in client.players"
                        :key="player.identifier"
                        class="player-entry"
                        :class="{active: player.isActive}">
                        <div>{{ player.displayName }} &middot; {{ player.playbackState }}</div>
                        <div
                            v-if="player.title"
                            class="client-meta">
                            {{ player.title }}
                        </div>
                    </div>

                    <details class="raw-state">
                        <summary>State</summary>
                        <div class="raw-state-content">
                            <div
                                v-for="[label, value] in stateFields(client)"
                                :key="label"
                                class="state-row">
                                <span class="state-label">{{ label }}</span>
                                <span class="state-value">{{ value }}</span>
                            </div>

                            <template v-for="player in client.players" :key="'raw-' + player.identifier">
                                <div
                                    v-if="playerFields(player).length > 0"
                                    class="raw-player-state">
                                    <div class="raw-player-header">{{ player.displayName }}</div>
                                    <div
                                        v-for="[label, value] in playerFields(player)"
                                        :key="label"
                                        class="state-row">
                                        <span class="state-label">{{ label }}</span>
                                        <span class="state-value">{{ value }}</span>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </details>
                </div>
            </div>
        </div>

        <div
            v-else
            class="empty-state">
            No device connected
        </div>
    </div>
</template>

<script
    setup
    lang="ts">
    import type { ClientSnapshot, PlayerSnapshot, StateSnapshot } from '../composables/useWebSocket';

    defineProps<{
        state: StateSnapshot;
    }>();

    const stateFields = (client: ClientSnapshot) => [
        ['Playback State', client.playbackState],
        ['Playback Rate', client.playbackRate],
        ['Media Type', client.mediaType],
        ['Genre', client.genre],
        ['Content ID', client.contentIdentifier],
        ['Shuffle', client.shuffleMode],
        ['Repeat', client.repeatMode],
        ['Duration', client.duration > 0 ? `${client.duration.toFixed(1)}s` : '-'],
        ['Elapsed', client.elapsedTime > 0 ? `${client.elapsedTime.toFixed(1)}s` : '-']
    ].filter(([, v]) => v !== '' && v !== 'Unknown' && v !== 0 && v !== 'UnknownMediaType');

    const playerFields = (player: PlayerSnapshot) => [
        ['Playback State', player.playbackState],
        ['Playback Rate', player.playbackRate],
        ['Media Type', player.mediaType],
        ['Genre', player.genre],
        ['Series', player.seriesName],
        ['Season', player.seasonNumber],
        ['Episode', player.episodeNumber],
        ['Content ID', player.contentIdentifier],
        ['Shuffle', player.shuffleMode],
        ['Repeat', player.repeatMode],
        ['Duration', player.duration > 0 ? `${player.duration.toFixed(1)}s` : null],
        ['Elapsed', player.elapsedTime > 0 ? `${player.elapsedTime.toFixed(1)}s` : null],
        ['Commands', player.supportedCommands.length > 0 ? player.supportedCommands.join(', ') : null]
    ].filter(([, v]) => v != null && v !== '' && v !== 'Unknown' && v !== 0 && v !== 'UnknownMediaType');
</script>
