import { ref } from 'vue';
import type { DeviceInfo } from './useWebSocket';

export function useDevice() {
    const devices = ref<DeviceInfo[]>([]);
    const discovering = ref(false);
    const connecting = ref(false);
    const error = ref<string | null>(null);

    let errorTimer: ReturnType<typeof setTimeout> | null = null;

    const setError = (message: string) => {
        error.value = message;

        if (errorTimer) {
            clearTimeout(errorTimer);
        }

        errorTimer = setTimeout(() => {
            error.value = null;
        }, 8000);
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
            setError(data.error);
            return null;
        }

        return data;
    };

    const discover = async () => {
        discovering.value = true;

        try {
            const data = await apiCall('/api/devices');

            if (data) {
                devices.value = data.devices ?? [];
            }
        } catch (err) {
            setError('Discovery failed: network error');
        } finally {
            discovering.value = false;
        }
    };

    const connectDevice = async (deviceId: string) => {
        connecting.value = true;

        try {
            await apiCall(`/api/devices/${encodeURIComponent(deviceId)}/connect`, 'POST');
        } catch (err) {
            setError('Connect failed: network error');
        } finally {
            connecting.value = false;
        }
    };

    const disconnectDevice = async () => {
        try {
            await apiCall('/api/devices/disconnect', 'POST');
        } catch (err) {
            setError('Disconnect failed: network error');
        }
    };

    const sendCommand = async (cmd: string, arg?: string) => {
        const path = arg ? `/api/command/${cmd}/${arg}` : `/api/command/${cmd}`;

        try {
            await apiCall(path, 'POST');
        } catch (err) {
            setError(`Command failed: ${cmd}`);
        }
    };

    const startPairing = async (deviceId: string, protocol: 'airplay' | 'companionLink') => {
        try {
            await apiCall(`/api/pair/${encodeURIComponent(deviceId)}/${protocol}`, 'POST');
        } catch (err) {
            setError('Pairing failed: network error');
        }
    };

    const submitPin = async (pin: string) => {
        try {
            await apiCall('/api/pair/pin', 'POST', {pin});
        } catch (err) {
            setError('PIN submission failed: network error');
        }
    };

    const cancelPairing = async () => {
        try {
            await apiCall('/api/pair/cancel', 'POST');
        } catch (err) {
            setError('Cancel pairing failed: network error');
        }
    };

    const connectByIp = async (address: string) => {
        connecting.value = true;

        try {
            await apiCall('/api/devices/connect-ip', 'POST', {address});
        } catch (err) {
            setError('Connect by IP failed: network error');
        } finally {
            connecting.value = false;
        }
    };

    const dismissError = () => {
        error.value = null;
    };

    return {devices, discovering, connecting, error, discover, connectDevice, connectByIp, disconnectDevice, sendCommand, startPairing, submitPin, cancelPairing, dismissError};
}
