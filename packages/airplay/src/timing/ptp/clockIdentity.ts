import { getMacAddress } from '../../utils';

/**
 * Generates an 8-byte EUI-64 clock identity from this machine's MAC-48 address,
 * for PTPv2 `sourcePortIdentity.clockIdentity`. The bytes `0xFF 0xFE` go
 * between the OUI (first three octets) and the NIC-specific part.
 */
export function generateClockIdentity(): Buffer {
    const mac = Buffer.from(getMacAddress().replace(/:/g, ''), 'hex');
    const id = Buffer.alloc(8);

    mac.copy(id, 0, 0, 3);
    id[3] = 0xFF;
    id[4] = 0xFE;
    mac.copy(id, 5, 3, 6);

    return id;
}
