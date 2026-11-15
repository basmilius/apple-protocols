import { Binary, Database, Gauge, LockKeyhole, Radar, ToggleLeft } from 'lucide-react';
import { ICONS } from '@/ui/icons';
import type { PanelDefinition } from './registry';
import { EncodingPanel } from './encoding/EncodingPanel';
import { EncryptionPanel } from './encryption/EncryptionPanel';
import { FeaturesPanel } from './features/FeaturesPanel';
import { MdnsPanel } from './mdns/MdnsPanel';
import { PerformancePanel } from './performance/PerformancePanel';
import { ProxyPanel } from './proxy/ProxyPanel';
import { StoragePanel } from './storage/StoragePanel';

/* Tools belong to no device, so they apply everywhere. */
export const TOOLS_PANELS: readonly PanelDefinition[] = [
    {
        id: 'performance',
        title: 'Performance',
        icon: Gauge,
        appliesTo: () => true,
        component: PerformancePanel
    },
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
        icon: LockKeyhole,
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
        icon: Radar,
        appliesTo: () => true,
        component: MdnsPanel
    },
    {
        id: 'storage',
        title: 'Storage',
        icon: Database,
        appliesTo: () => true,
        component: StoragePanel
    },
    {
        id: 'proxy',
        title: 'Proxy',
        icon: ICONS.proxy,
        appliesTo: () => true,
        component: ProxyPanel
    }
];
