import type { AccessoryCredentials, DiscoveryResult, ProtocolType, Storage } from '@basmilius/apple-common';

export default function (storage: Storage, device: DiscoveryResult, protocol: ProtocolType): AccessoryCredentials {
    const credentials = storage.getCredentials(device.id, protocol);

    if (!credentials) {
        throw new Error(`Credentials for ${device.id} (${protocol}) not found. Pair first.`);
    }

    return credentials;
}
