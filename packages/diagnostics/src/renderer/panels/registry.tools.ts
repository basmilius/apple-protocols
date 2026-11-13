import { Activity, Binary, Database, KeyRound, Radio, ToggleLeft } from 'lucide-react';
import type { PanelDefinition } from './registry';
import { EncodingPanel } from './encoding/EncodingPanel';
import { EncryptionPanel } from './encryption/EncryptionPanel';
import { FeaturesPanel } from './features/FeaturesPanel';
import { MdnsPanel } from './mdns/MdnsPanel';
import { PerformancePanel } from './performance/PerformancePanel';
import { StoragePanel } from './storage/StoragePanel';

/* Tools also work in cells without a device. */
export const TOOLS_PANELS: readonly PanelDefinition[] = [
    {id: 'performance', title: 'Performance', icon: Activity, appliesTo: () => true, component: PerformancePanel},
    {
        id: 'encoding',
        title: 'Encoding',
        icon: Binary,
        appliesTo: () => true,
        component: EncodingPanel
    },
    {
        id: 'encryption',
        title: 'Encryption',
        icon: KeyRound,
        appliesTo: () => true,
        component: EncryptionPanel
    },
    {
        id: 'features',
        title: 'Feature flags',
        icon: ToggleLeft,
        appliesTo: () => true,
        component: FeaturesPanel
    },
    {
        id: 'mdns',
        title: 'mDNS',
        icon: Radio,
        appliesTo: () => true,
        component: MdnsPanel
    },
    {
        id: 'storage',
        title: 'Storage',
        icon: Database,
        appliesTo: () => true,
        component: StoragePanel
    }
];
