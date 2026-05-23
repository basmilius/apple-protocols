import { getMacAddress } from '../../utils';

/**
 * Generates an IEEE EUI-64 clock identity from this machine's MAC-48 address.
 *
 * EUI-64 is derived from MAC-48 by inserting the bytes `0xFF 0xFE` between
 * the OUI (first three octets) and the NIC-specific portion (last three
 * octets), yielding an 8-byte identifier as required by PTPv2
 * `sourcePortIdentity.clockIdentity`.
 *
 * @returns An 8-byte EUI-64 buffer.
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
