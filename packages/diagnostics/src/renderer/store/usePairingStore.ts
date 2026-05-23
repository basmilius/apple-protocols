import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke, on } from '@renderer/app/ipc';
import type { DeviceProtocol, PairingPhase } from '@shared/snapshots';

export const usePairingStore = defineStore('pairing', () => {
    const phase = ref<PairingPhase>('idle');
    const protocol = ref<DeviceProtocol | null>(null);
    const deviceId = ref<string | null>(null);
    const deviceName = ref<string | null>(null);
    const error = ref<string | undefined>(undefined);

    on('pairing:started', (payload) => {
        phase.value = 'starting';
        protocol.value = payload.protocol;
        deviceId.value = payload.deviceId;
        deviceName.value = payload.deviceName;
        error.value = undefined;
    });

    on('pairing:pin-requested', () => {
        phase.value = 'awaiting-pin';
    });

    on('pairing:ended', (result) => {
        phase.value = result.success ? 'success' : 'error';
        error.value = result.error;
    });

    on('pairing:unpaired', () => {
        phase.value = 'idle';
        deviceId.value = null;
        deviceName.value = null;
        protocol.value = null;
    });

    async function start(id: string, proto: DeviceProtocol): Promise<void> {
        phase.value = 'starting';
        deviceId.value = id;
        protocol.value = proto;
        error.value = undefined;

        try {
            await invoke('pairing:start', {deviceId: id, protocol: proto});
        } catch (err) {
            phase.value = 'error';
            error.value = err instanceof Error ? err.message : String(err);
            throw err;
        }
    }

    async function submitPin(pin: string): Promise<void> {
        phase.value = 'verifying';
        await invoke('pairing:submit-pin', {pin});
    }

    async function cancel(): Promise<void> {
        await invoke('pairing:cancel', undefined as never);
        phase.value = 'idle';
    }

    async function unpair(id: string, proto: DeviceProtocol): Promise<void> {
        await invoke('pairing:unpair', {deviceId: id, protocol: proto});
    }

    function reset(): void {
        phase.value = 'idle';
        deviceId.value = null;
        deviceName.value = null;
        protocol.value = null;
        error.value = undefined;
    }

    return {
        phase,
        protocol,
        deviceId,
        deviceName,
        error,
        start,
        submitPin,
        cancel,
        unpair,
        reset
    };
});
