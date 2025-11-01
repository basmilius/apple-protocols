import { networkInterfaces } from 'node:os';

export default function (): string {
    const interfaces = networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];

        if (!iface) {
            continue;
        }

        for (const net of iface) {
            if (net.internal || net.family !== 'IPv4') {
                continue;
            }

            if (net.address && net.address !== '127.0.0.1') {
                return net.address;
            }
        }
    }

    return null;
}
