import { Binary, Database, KeyRound, Radio, ToggleLeft } from 'lucide-react';
import type { PanelDefinition } from './registry';
import { EncodingPanel } from './encoding/EncodingPanel';
import { EncryptionPanel } from './encryption/EncryptionPanel';
import { FeaturesPanel } from './features/FeaturesPanel';
import { MdnsPanel } from './mdns/MdnsPanel';
import { StoragePanel } from './storage/StoragePanel';

/* Tools also work in cells without a device. */
export const TOOLS_PANELS: readonly PanelDefinition[] = [
    {
        id: 'encoding',
        title: 'Encoding',
        icon: Binary,
        group: 'tools',
        appliesTo: () => true,
        component: EncodingPanel
    },
    {
        id: 'encryption',
        title: 'Encryption',
        icon: KeyRound,
        group: 'tools',
        appliesTo: () => true,
        component: EncryptionPanel
    },
    {
        id: 'features',
        title: 'Feature flags',
        icon: ToggleLeft,
        group: 'tools',
        appliesTo: () => true,
        component: FeaturesPanel
    },
    {
        id: 'mdns',
        title: 'mDNS',
        icon: Radio,
        group: 'tools',
        appliesTo: () => true,
        component: MdnsPanel
    },
    {
        id: 'storage',
        title: 'Storage',
        icon: Database,
        group: 'tools',
        appliesTo: () => true,
        component: StoragePanel
    }
];
