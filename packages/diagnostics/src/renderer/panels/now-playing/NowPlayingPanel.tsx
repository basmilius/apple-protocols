import type { PanelProps } from '@/panels/registry';
import { ArtworkPanel } from './ArtworkSection';

export function NowPlayingPanel(props: PanelProps) {
    return <ArtworkPanel {...props}/>;
}
