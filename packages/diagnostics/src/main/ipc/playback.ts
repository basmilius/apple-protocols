import { Proto } from '@basmilius/apple-airplay';
import type { IpcMain } from 'electron';
import { handle, type IpcContext } from './index';
import type { RepeatModeInput, ShuffleModeInput } from '@shared/ipc';

const SHUFFLE_MAP: Record<ShuffleModeInput, Proto.ShuffleMode_Enum> = {
    off: Proto.ShuffleMode_Enum.Off,
    albums: Proto.ShuffleMode_Enum.Albums,
    songs: Proto.ShuffleMode_Enum.Songs
};

const REPEAT_MAP: Record<RepeatModeInput, Proto.RepeatMode_Enum> = {
    off: Proto.RepeatMode_Enum.Off,
    one: Proto.RepeatMode_Enum.One,
    all: Proto.RepeatMode_Enum.All
};

export function registerPlayback(ipcMain: IpcMain, ctx: IpcContext): void {
    handle(ipcMain, ctx, 'playback:command', async (_, {action}) => {
        const device = ctx.activeDevice.requireDevice();

        switch (action) {
            case 'play': await device.playback.play(); break;
            case 'pause': await device.playback.pause(); break;
            case 'playPause': await device.playback.playPause(); break;
            case 'stop': await device.playback.stop(); break;
            case 'next': await device.playback.next(); break;
            case 'previous': await device.playback.previous(); break;
            case 'advanceShuffle': await device.playback.advanceShuffleMode(); break;
            case 'advanceRepeat': await device.playback.advanceRepeatMode(); break;
        }

        return null;
    });

    handle(ipcMain, ctx, 'playback:seek', async (_, {position}) => {
        const device = ctx.activeDevice.requireDevice();
        await device.playback.seekTo(position);
        return null;
    });

    handle(ipcMain, ctx, 'playback:skip', async (_, {direction, seconds}) => {
        const device = ctx.activeDevice.requireDevice();
        const amount = seconds ?? 15;

        if (direction === 'forward') {
            await device.playback.skipForward(amount);
        } else {
            await device.playback.skipBackward(amount);
        }

        return null;
    });

    handle(ipcMain, ctx, 'playback:set-shuffle', async (_, {mode}) => {
        const device = ctx.activeDevice.requireDevice();
        await device.playback.setShuffleMode(SHUFFLE_MAP[mode]);
        return null;
    });

    handle(ipcMain, ctx, 'playback:set-repeat', async (_, {mode}) => {
        const device = ctx.activeDevice.requireDevice();
        await device.playback.setRepeatMode(REPEAT_MAP[mode]);
        return null;
    });

    handle(ipcMain, ctx, 'playback:request-queue', async (_, {length}) => {
        const device = ctx.activeDevice.requireDevice();
        await device.playback.requestPlaybackQueue(length ?? 1);
        return null;
    });
}
