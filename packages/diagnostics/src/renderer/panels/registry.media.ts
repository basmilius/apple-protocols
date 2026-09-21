import { Cable, KeyRound, Radio, Sliders, Speaker, Terminal, TvMinimalPlay } from 'lucide-react';
import { AudioPanel } from './audio/AudioPanel';
import { ConnectionPanel } from './connection/ConnectionPanel';
import { ControlStreamPanel } from './control-stream/ControlStreamPanel';
import { PairingPanel } from './pairing/PairingPanel';
import { RaopPanel } from './raop/RaopPanel';
import { RawCompanionPanel } from './raw-companion/RawCompanionPanel';
import { RawDataStreamPanel } from './raw-datastream/RawDataStreamPanel';
import type { PanelDefinition } from './registry';

export const MEDIA_PANELS: readonly PanelDefinition[] = [
    {
        id: 'pairing',
        title: 'Pairing',
        icon: KeyRound,
        group: 'protocol',
        appliesTo: context => context.device !== null,
        component: PairingPanel
    },
    {
        id: 'connection',
        title: 'Connection',
        icon: Cable,
        group: 'protocol',
        appliesTo: context => context.device !== null,
        component: ConnectionPanel
    },
    {
        id: 'audio',
        title: 'Audio',
        icon: Speaker,
        group: 'media',
        appliesTo: context => context.device !== null && context.device.services.airplay !== null,
        component: AudioPanel
    },
    {
        id: 'raop',
        title: 'RAOP',
        icon: Radio,
        group: 'media',
        appliesTo: context => context.device !== null,
        component: RaopPanel
    },
    {
        id: 'raw-datastream',
        title: 'Raw data stream',
        icon: Terminal,
        group: 'protocol',
        appliesTo: context => context.device !== null && context.device.services.airplay !== null,
        component: RawDataStreamPanel
    },
    {
        id: 'raw-companion',
        title: 'Raw Companion Link',
        icon: TvMinimalPlay,
        group: 'protocol',
        appliesTo: context => context.device !== null && context.device.services.companionLink !== null,
        component: RawCompanionPanel
    },
    {
        id: 'control-stream',
        title: 'Control stream',
        icon: Sliders,
        group: 'protocol',
        appliesTo: context => context.device !== null && context.device.services.airplay !== null,
        component: ControlStreamPanel
    }
];
