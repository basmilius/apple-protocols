import { file, write } from 'bun';
import type { AccessoryCredentials, DiscoveryResult } from '@basmilius/apple-common';

export default async function getSavedCredentials(device: DiscoveryResult): Promise<AccessoryCredentials> {
    const credentials = file(`${device.id}.ap-creds`);

    if (!await credentials.exists()) {
        throw new Error(`Credentials for ${device.id} not found. Pair first.`);
    }

    const json = await credentials.json();

    return {
        accessoryIdentifier: json.accessoryIdentifier,
        accessoryLongTermPublicKey: Buffer.from(json.accessoryLongTermPublicKey, 'hex'),
        pairingId: Buffer.from(json.pairingId, 'hex'),
        publicKey: Buffer.from(json.publicKey, 'hex'),
        secretKey: Buffer.from(json.secretKey, 'hex')
    };
}

export async function saveCredentials(device: DiscoveryResult, credentials: AccessoryCredentials): Promise<void> {
    const data = {
        accessoryIdentifier: credentials.accessoryIdentifier,
        accessoryLongTermPublicKey: credentials.accessoryLongTermPublicKey.toString('hex'),
        pairingId: credentials.pairingId.toString('hex'),
        publicKey: credentials.publicKey.toString('hex'),
        secretKey: credentials.secretKey.toString('hex')
    };

    console.log('Credentials:');
    console.log(data);

    await write(`${device.id}.ap-creds`, JSON.stringify(data));
}

