import { Proto } from '@basmilius/apple-airplay';

export const PlaybackStateLabel: Record<number, string> = {
    [Proto.PlaybackState_Enum.Unknown]: 'Unknown',
    [Proto.PlaybackState_Enum.Playing]: 'Playing',
    [Proto.PlaybackState_Enum.Paused]: 'Paused',
    [Proto.PlaybackState_Enum.Stopped]: 'Stopped',
    [Proto.PlaybackState_Enum.Interrupted]: 'Interrupted',
    [Proto.PlaybackState_Enum.Seeking]: 'Seeking'
};

export const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}:${secs.toString().padStart(2, '0')}`;
};
