import { Cable, KeyRound, Radio, Terminal } from 'lucide-react';
import { ICONS } from '@/ui/icons';
import { AudioPanel } from './audio/AudioPanel';
import { ConnectionPanel } from './connection/ConnectionPanel';
import { PairingPanel } from './pairing/PairingPanel';
import { RaopPanel } from './raop/RaopPanel';
import { RawPanel } from './raw/RawPanel';
import type { PanelDefinition } from './registry';

export const MEDIA_PANELS: readonly PanelDefinition[] = [
    {
        id: 'pairing',
        title: 'Pairing',
        icon: KeyRound,
        appliesTo: context => context.device !== null,
        component: PairingPanel
    },
    {
        id: 'connection',
        title: 'Connection',
        icon: Cable,
        appliesTo: context => context.device !== null,
        component: ConnectionPanel
    },
    {
        id: 'audio',
        title: 'AirPlay audio',
        icon: ICONS.audio,
        appliesTo: context => context.device !== null && context.device.services.airplay !== null,
        component: AudioPanel
    },
    {
        id: 'raop',
        title: 'RAOP',
        icon: Radio,
        appliesTo: context => context.device !== null,
        component: RaopPanel
    },
    {
        id: 'raw',
        title: 'Raw',
        icon: Terminal,
        appliesTo: context => context.device !== null && (context.device.services.airplay !== null || context.device.services.companionLink !== null),
        component: RawPanel
    }
];
