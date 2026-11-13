import { useState } from 'react';
import { ArrowDownUp, Ban, MoveVertical, SlidersHorizontal, Volume1, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import type { VolumeControl, VolumeSnapshot } from '@shared/contract';
import type { DeviceCall } from '@/panels/hooks';
import { Button, ButtonGroup, Icon, Pill, Slider } from '@/ui';

const MODES: Record<VolumeControl, { readonly label: string; readonly icon: LucideIcon }> = {
    absolute: {label: 'Absolute', icon: SlidersHorizontal},
    relative: {label: 'Relative only', icon: MoveVertical},
    both: {label: 'Absolute and relative', icon: ArrowDownUp},
    none: {label: 'No volume control', icon: Ban}
};

/** The SDK sets and fades the level only with absolute control; up, down, mute and adjust also work relative. */
export const setsLevel = (control: VolumeControl): boolean => control === 'absolute' || control === 'both';

export function VolumeModePill({control}: { readonly control: VolumeControl }) {
    const mode = MODES[control];

    return (
        <Pill tone={control === 'none' ? 'muted' : 'accent'} icon={<Icon icon={mode.icon} size={12}/>}>
            {mode.label}
        </Pill>
    );
}

type VolumeControlsProps = {
    readonly volume: VolumeSnapshot | null;
    readonly connected: boolean;
    readonly call: DeviceCall;
};

/* Sends the level on release; per-frame commands would flood the serial device connection. */
export function VolumeControls({volume, connected, call}: VolumeControlsProps) {
    const [dragging, setDragging] = useState<number | null>(null);
    const control = volume?.control ?? 'none';
    const level = dragging ?? volume?.level ?? 0;

    if (!connected) {
        return <p className="text-xs text-text-muted">Not connected, so the device reports no volume control yet.</p>;
    }

    if (control === 'none') {
        return <p className="text-xs text-text-muted">This device reports no volume control.</p>;
    }

    const keys = (
        <ButtonGroup>
            <Button variant="secondary" size="sm" onClick={() => void call('device', 'volume.down')}>
                <Icon icon={Volume1} size={14}/>
                Volume down
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void call('device', 'volume.up')}>
                <Icon icon={Volume2} size={14}/>
                Volume up
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void call('device', 'volume.toggleMute')}>
                <Icon icon={VolumeX} size={14}/>
                {volume?.muted ? 'Unmute' : 'Mute'}
            </Button>
        </ButtonGroup>
    );

    if (!setsLevel(control)) {
        return (
            <>
                {keys}
                <p className="text-xs text-text-muted">This device takes volume up, down and mute, but no absolute level.</p>
            </>
        );
    }

    return (
        <>
            <div className="flex items-center gap-1">
                <Icon icon={volume?.muted ? VolumeX : Volume2} size={14} className="shrink-0 text-text-faint"/>
                <Slider
                    label="Volume"
                    value={level}
                    onValueChange={setDragging}
                    onValueCommitted={next => {
                        setDragging(null);
                        void call('device', 'volume.set', [next / 100]);
                    }}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">{level}%</span>
            </div>
            {keys}
        </>
    );
}
