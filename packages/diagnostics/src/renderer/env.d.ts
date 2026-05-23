/// <reference types="vite/client" />
/// <reference types="@flux-ui/types" />

import type { IpcApi } from '@shared/ipc';

declare global {
    interface Window {
        api: IpcApi;
    }
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<{}, {}, any>;
    export default component;
}
