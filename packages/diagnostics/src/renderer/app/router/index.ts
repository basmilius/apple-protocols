import type { App, FunctionPlugin } from 'vue';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        redirect: {name: 'devices'}
    },
    {
        path: '/devices',
        name: 'devices',
        component: () => import('@renderer/view/devices/Devices.vue')
    },
    {
        path: '/devices/:deviceId',
        components: {
            default: () => import('@renderer/view/devices/DeviceShell.vue'),
            menu: () => import('@renderer/view/devices/DeviceContextMenu.vue')
        },
        children: [
            {
                path: '',
                name: 'device-detail',
                component: () => import('@renderer/view/devices/DeviceDetail.vue')
            },
            {
                path: 'remote',
                name: 'device-remote',
                component: () => import('@renderer/view/Remote.vue')
            },
            {
                path: 'tools',
                name: 'device-tools',
                component: () => import('@renderer/view/Tools.vue')
            },
            {
                path: 'audio-playback',
                name: 'device-audio-playback',
                component: () => import('@renderer/view/AudioPlayback.vue')
            }
        ]
    },
    {
        path: '/multi-room',
        name: 'multi-room',
        component: () => import('@renderer/view/MultiRoom.vue')
    },
    {
        path: '/mdns',
        name: 'mdns',
        component: () => import('@renderer/view/Mdns.vue')
    },
    {
        path: '/timing',
        name: 'timing',
        component: () => import('@renderer/view/Timing.vue')
    }
];

export const routerInstance = createRouter({
    history: createMemoryHistory(),
    routes
});

const router: FunctionPlugin = (app: App) => {
    app.use(routerInstance);
};

export default router;
