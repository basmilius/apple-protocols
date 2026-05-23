import { invoke } from '@renderer/app/ipc';
import type { NavigationButton } from '@shared/ipc';

function makeNavigator(button: NavigationButton): () => Promise<void> {
    return async () => {
        await invoke('remote:navigate', {button});
    };
}

export function useRemoteNavigation() {
    return {
        up: makeNavigator('up'),
        down: makeNavigator('down'),
        left: makeNavigator('left'),
        right: makeNavigator('right'),
        select: makeNavigator('select'),
        menu: makeNavigator('menu'),
        home: makeNavigator('home'),
        topMenu: makeNavigator('topMenu'),
        back: makeNavigator('back'),
        channelUp: makeNavigator('channelUp'),
        channelDown: makeNavigator('channelDown')
    };
}
