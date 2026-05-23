import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import type { NtpServerSnapshot, PtpMasterSnapshot } from '@shared/snapshots';

const initialNtp: NtpServerSnapshot = {
    running: false,
    port: null
};

const initialPtp: PtpMasterSnapshot = {
    running: false,
    peerAddress: null,
    clockIdentity: null,
    eventPort: null,
    generalPort: null,
    state: null,
    syncsSent: 0,
    announcesSent: 0,
    delayReqsReceived: 0,
    delayRespsSent: 0,
    announcesReceived: 0
};

export const useTimingStore = defineStore('timing', () => {
    const ntp = ref<NtpServerSnapshot>(initialNtp);
    const ptp = ref<PtpMasterSnapshot>(initialPtp);

    on('timing:ntp:state', (snapshot) => {
        ntp.value = snapshot;
    });

    on('timing:ptp:state', (snapshot) => {
        ptp.value = snapshot;
    });

    async function refreshNtp(): Promise<NtpServerSnapshot> {
        ntp.value = await invoke('timing:ntp:state', undefined as never);
        return ntp.value;
    }

    async function refreshPtp(): Promise<PtpMasterSnapshot> {
        ptp.value = await invoke('timing:ptp:state', undefined as never);
        return ptp.value;
    }

    async function startNtp(): Promise<NtpServerSnapshot> {
        ntp.value = await invoke('timing:ntp:start', undefined as never);
        return ntp.value;
    }

    async function stopNtp(): Promise<NtpServerSnapshot> {
        ntp.value = await invoke('timing:ntp:stop', undefined as never);
        return ntp.value;
    }

    async function startPtp(address: string): Promise<PtpMasterSnapshot> {
        ptp.value = await invoke('timing:ptp:start', {address});
        return ptp.value;
    }

    async function stopPtp(): Promise<PtpMasterSnapshot> {
        ptp.value = await invoke('timing:ptp:stop', undefined as never);
        return ptp.value;
    }

    return {
        ntp,
        ptp,
        refreshNtp,
        refreshPtp,
        startNtp,
        stopNtp,
        startPtp,
        stopPtp
    };
});
