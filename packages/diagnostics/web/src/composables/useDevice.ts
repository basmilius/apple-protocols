import { ref } from 'vue';
import { showSnackbar } from '@flux-ui/components';
import type { DeviceInfo } from './useWebSocket';

export function useDevice() {
    const devices = ref<DeviceInfo[]>([]);
    const discovering = ref(false);
    const connecting = ref(false);

    const showError = (message: string) => {
        showSnackbar({
            color: 'danger',
            icon: 'circle-exclamation',
            message,
            duration: 5000
        });
    };

    const apiCall = async (url: string, method = 'GET', body?: object): Promise<any> => {
        const options: RequestInit = {method};

        if (body) {
            options.headers = {'Content-Type': 'application/json'};
            options.body = JSON.stringify(body);
        }

        const res = await fetch(url, options);
        const data = await res.json();

        if (data.error) {
            showError(data.error);
            return null;
        }

        return data;
    };

    const discover = async () => {
        discovering.value = true;

        try {
            const data = await apiCall('/api/devices');

            if (data) {
                devices.value = (data.devices ?? []).sort((a: DeviceInfo, b: DeviceInfo) => a.name.localeCompare(b.name));
            }
        } catch {
            showError('Discovery failed: network error');
        } finally {
            discovering.value = false;
        }
    };

    const connectDevice = async (deviceId: string) => {
        connecting.value = true;

        try {
            await apiCall(`/api/devices/${encodeURIComponent(deviceId)}/connect`, 'POST');
        } catch {
            showError('Connect failed: network error');
        } finally {
            connecting.value = false;
        }
    };

    const disconnectDevice = async () => {
        try {
            await apiCall('/api/devices/disconnect', 'POST');
        } catch {
            showError('Disconnect failed: network error');
        }
    };

    const sendCommand = async (cmd: string, arg?: string): Promise<any> => {
        const path = arg ? `/api/command/${cmd}/${arg}` : `/api/command/${cmd}`;

        try {
            return await apiCall(path, 'POST');
        } catch {
            showError(`Command failed: ${cmd}`);
            return null;
        }
    };

    const startPairing = async (deviceId: string, protocol: 'airplay' | 'companionLink') => {
        try {
            await apiCall(`/api/pair/${encodeURIComponent(deviceId)}/${protocol}`, 'POST');
        } catch {
            showError('Pairing failed: network error');
        }
    };

    const submitPin = async (pin: string) => {
        try {
            await apiCall('/api/pair/pin', 'POST', {pin});
        } catch {
            showError('PIN submission failed: network error');
        }
    };

    const cancelPairing = async () => {
        try {
            await apiCall('/api/pair/cancel', 'POST');
        } catch {
            showError('Cancel pairing failed: network error');
        }
    };

    const connectByIp = async (address: string) => {
        connecting.value = true;

        try {
            await apiCall('/api/devices/connect-ip', 'POST', {address});
        } catch {
            showError('Connect by IP failed: network error');
        } finally {
            connecting.value = false;
        }
    };

    return {devices, discovering, connecting, discover, connectDevice, connectByIp, disconnectDevice, sendCommand, startPairing, submitPin, cancelPairing};
}
