import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { createConnection } from 'node:net';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const QUERY_ID = 0x35FF;
const QUERY_FLAGS = 0x0120;
const SERVICES_PER_MSG = 3;

const QueryType = {
    A: 0x01,
    PTR: 0x0C,
    TXT: 0x10,
    AAAA: 0x1C,
    SRV: 0x21,
    ANY: 0xFF
} as const;

export type MdnsService = {
    readonly name: string;
    readonly type: string;
    readonly address: string;
    readonly port: number;
    readonly properties: Record<string, string>;
};

type DnsHeader = {
    id: number;
    flags: number;
    qdcount: number;
    ancount: number;
    nscount: number;
    arcount: number;
};

type DnsResource = {
    qname: string;
    qtype: number;
    qclass: number;
    ttl: number;
    rdata: unknown;
};

type SrvRecord = {
    priority: number;
    weight: number;
    port: number;
    target: string;
};

// --- DNS Packet Encoding ---

const encodeQName = (name: string): Buffer => {
    const parts = [];
    const labels = splitServiceName(name);

    for (const label of labels) {
        const encoded = Buffer.from(label, 'utf-8');

        if (encoded.byteLength > 63) {
            parts.push(Buffer.from([63]), encoded.subarray(0, 63));
        } else {
            parts.push(Buffer.from([encoded.byteLength]), encoded);
        }
    }

    parts.push(Buffer.from([0x00]));

    return Buffer.concat(parts);
};

const splitServiceName = (name: string): string[] => {
    // Handle service instance names like "Living Room._airplay._tcp.local"
    // The instance name can contain dots, so we need to find the service type part
    const servicePattern = /\._[a-z]+\._(?:tcp|udp)\.local$/;
    const match = name.match(servicePattern);

    if (match) {
        const instanceName = name.substring(0, match.index);
        const servicePart = match[0].substring(1); // remove leading dot

        return [instanceName, ...servicePart.split('.')];
    }

    return name.split('.');
};

const encodeDnsHeader = (header: DnsHeader): Buffer => {
    const buf = Buffer.allocUnsafe(12);
    buf.writeUInt16BE(header.id, 0);
    buf.writeUInt16BE(header.flags, 2);
    buf.writeUInt16BE(header.qdcount, 4);
    buf.writeUInt16BE(header.ancount, 6);
    buf.writeUInt16BE(header.nscount, 8);
    buf.writeUInt16BE(header.arcount, 10);

    return buf;
};

const encodeDnsQuestion = (name: string, qtype: number, unicastResponse: boolean = false): Buffer => {
    const qname = encodeQName(name);
    const suffix = Buffer.allocUnsafe(4);
    suffix.writeUInt16BE(qtype, 0);
    suffix.writeUInt16BE(unicastResponse ? 0x8001 : 0x0001, 2);

    return Buffer.concat([qname, suffix]);
};

export function createQueryPackets(services: string[], qtype: number = QueryType.PTR, unicastResponse: boolean = false): Buffer[] {
    const packets: Buffer[] = [];

    for (let i = 0; i < services.length; i += SERVICES_PER_MSG) {
        const chunk = services.slice(i, i + SERVICES_PER_MSG);
        const questions = chunk.map(s => encodeDnsQuestion(s, qtype, unicastResponse));
        const header = encodeDnsHeader({
            id: QUERY_ID,
            flags: 0x0000,
            qdcount: chunk.length,
            ancount: 0,
            nscount: 0,
            arcount: 0
        });

        packets.push(Buffer.concat([header, ...questions]));
    }

    return packets;
}

// --- DNS Packet Decoding ---

const decodeQName = (buf: Buffer, offset: number): [string, number] => {
    const labels: string[] = [];
    let currentOffset = offset;
    let jumped = false;
    let returnOffset = offset;

    while (currentOffset < buf.byteLength) {
        const length = buf[currentOffset];

        if (length === 0) {
            if (!jumped) {
                returnOffset = currentOffset + 1;
            }

            break;
        }

        // Name compression pointer (upper 2 bits = 11)
        if ((length & 0xC0) === 0xC0) {
            const pointer = ((length & 0x3F) << 8) | buf[currentOffset + 1];

            if (!jumped) {
                returnOffset = currentOffset + 2;
            }

            currentOffset = pointer;
            jumped = true;
            continue;
        }

        currentOffset++;
        labels.push(buf.toString('utf-8', currentOffset, currentOffset + length));
        currentOffset += length;

        if (!jumped) {
            returnOffset = currentOffset;
        }
    }

    return [labels.join('.'), returnOffset];
};

const decodeDnsHeader = (buf: Buffer): DnsHeader => ({
    id: buf.readUInt16BE(0),
    flags: buf.readUInt16BE(2),
    qdcount: buf.readUInt16BE(4),
    ancount: buf.readUInt16BE(6),
    nscount: buf.readUInt16BE(8),
    arcount: buf.readUInt16BE(10)
});

const decodeQuestion = (buf: Buffer, offset: number): [{ qname: string; qtype: number; qclass: number }, number] => {
    const [qname, newOffset] = decodeQName(buf, offset);
    const qtype = buf.readUInt16BE(newOffset);
    const qclass = buf.readUInt16BE(newOffset + 2);

    return [{ qname, qtype, qclass }, newOffset + 4];
};

const decodeTxtRecord = (buf: Buffer, offset: number, length: number): Record<string, string> => {
    const properties: Record<string, string> = {};
    let pos = offset;
    const end = offset + length;

    while (pos < end) {
        const strLen = buf[pos];
        pos++;

        if (strLen === 0 || pos + strLen > end) {
            break;
        }

        const str = buf.toString('utf-8', pos, pos + strLen);
        pos += strLen;

        const eqIndex = str.indexOf('=');

        if (eqIndex >= 0) {
            properties[str.substring(0, eqIndex)] = str.substring(eqIndex + 1);
        } else {
            properties[str] = '';
        }
    }

    return properties;
};

const decodeSrvRecord = (buf: Buffer, offset: number): SrvRecord => {
    const priority = buf.readUInt16BE(offset);
    const weight = buf.readUInt16BE(offset + 2);
    const port = buf.readUInt16BE(offset + 4);
    const [target] = decodeQName(buf, offset + 6);

    return { priority, weight, port, target };
};

const decodeResource = (buf: Buffer, offset: number): [DnsResource, number] => {
    const [qname, nameEnd] = decodeQName(buf, offset);
    const qtype = buf.readUInt16BE(nameEnd);
    const qclass = buf.readUInt16BE(nameEnd + 2);
    const ttl = buf.readUInt32BE(nameEnd + 4);
    const rdLength = buf.readUInt16BE(nameEnd + 8);
    const rdOffset = nameEnd + 10;

    let rdata: unknown;

    switch (qtype) {
        case QueryType.A:
            rdata = `${buf[rdOffset]}.${buf[rdOffset + 1]}.${buf[rdOffset + 2]}.${buf[rdOffset + 3]}`;
            break;

        case QueryType.AAAA: {
            const parts: string[] = [];

            for (let i = 0; i < 8; i++) {
                parts.push(buf.readUInt16BE(rdOffset + i * 2).toString(16));
            }

            rdata = parts.join(':');
            break;
        }

        case QueryType.PTR: {
            const [name] = decodeQName(buf, rdOffset);
            rdata = name;
            break;
        }

        case QueryType.SRV:
            rdata = decodeSrvRecord(buf, rdOffset);
            break;

        case QueryType.TXT:
            rdata = decodeTxtRecord(buf, rdOffset, rdLength);
            break;

        default:
            rdata = buf.subarray(rdOffset, rdOffset + rdLength);
    }

    return [{ qname, qtype, qclass, ttl, rdata }, rdOffset + rdLength];
};

export const decodeDnsResponse = (buf: Buffer): { header: DnsHeader; answers: DnsResource[]; resources: DnsResource[] } => {
    const header = decodeDnsHeader(buf);
    let offset = 12;

    // Skip questions
    for (let i = 0; i < header.qdcount; i++) {
        const [, newOffset] = decodeQuestion(buf, offset);
        offset = newOffset;
    }

    // Parse answers
    const answers: DnsResource[] = [];

    for (let i = 0; i < header.ancount; i++) {
        const [record, newOffset] = decodeResource(buf, offset);
        answers.push(record);
        offset = newOffset;
    }

    // Skip authorities
    for (let i = 0; i < header.nscount; i++) {
        const [, newOffset] = decodeResource(buf, offset);
        offset = newOffset;
    }

    // Parse additional resources
    const resources: DnsResource[] = [];

    for (let i = 0; i < header.arcount; i++) {
        const [record, newOffset] = decodeResource(buf, offset);
        resources.push(record);
        offset = newOffset;
    }

    return { header, answers, resources };
};

// --- Service Collector (aggregates records across multiple responses) ---

class ServiceCollector {
    readonly #ptrMap = new Map<string, Set<string>>();
    readonly #srvMap = new Map<string, SrvRecord>();
    readonly #txtMap = new Map<string, Record<string, string>>();
    readonly #addressMap = new Map<string, string>();

    addRecords(answers: DnsResource[], resources: DnsResource[]): void {
        for (const record of [...answers, ...resources]) {
            switch (record.qtype) {
                case QueryType.PTR: {
                    const existing = this.#ptrMap.get(record.qname);

                    if (existing) {
                        existing.add(record.rdata as string);
                    } else {
                        this.#ptrMap.set(record.qname, new Set([record.rdata as string]));
                    }

                    break;
                }

                case QueryType.SRV:
                    this.#srvMap.set(record.qname, record.rdata as SrvRecord);
                    break;

                case QueryType.TXT:
                    this.#txtMap.set(record.qname, record.rdata as Record<string, string>);
                    break;

                case QueryType.A:
                    this.#addressMap.set(record.qname, record.rdata as string);
                    break;
            }
        }
    }

    get services(): MdnsService[] {
        const results: MdnsService[] = [];

        for (const [serviceType, instanceNames] of this.#ptrMap) {
            for (const instanceQName of instanceNames) {
                const srv = this.#srvMap.get(instanceQName);

                if (!srv || srv.port === 0) {
                    continue;
                }

                const address = this.#addressMap.get(srv.target);

                if (!address) {
                    continue;
                }

                const txt = this.#txtMap.get(instanceQName) ?? {};
                const typeIndex = instanceQName.indexOf('._');
                const name = typeIndex >= 0 ? instanceQName.substring(0, typeIndex) : instanceQName;

                if (!results.some(s => s.name === name && s.type === serviceType)) {
                    results.push({ name, type: serviceType, address, port: srv.port, properties: txt });
                }
            }
        }

        return results;
    }
}

// --- Scanners ---

const WAKE_PORTS = [7000, 3689, 49152, 32498];

const knock = (address: string): Promise<void> => {
    const promises = WAKE_PORTS.map(port => new Promise<void>((resolve) => {
        const socket = createConnection({ host: address, port, timeout: 500 });
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('error', () => { socket.destroy(); resolve(); });
        socket.on('timeout', () => { socket.destroy(); resolve(); });
    }));

    return Promise.all(promises).then(() => {});
};

export function unicast(hosts: string[], services: string[], timeout: number = 4): Promise<MdnsService[]> {
    return new Promise((resolve) => {
        const queries = createQueryPackets(services);
        const collector = new ServiceCollector();
        const sockets: UdpSocket[] = [];
        let resolved = false;

        const finish = () => {
            if (resolved) {
                return;
            }

            resolved = true;
            clearInterval(interval);

            for (const socket of sockets) {
                try {
                    socket.close();
                } catch {}
            }

            resolve(collector.services);
        };

        for (const host of hosts) {
            const socket = createSocket('udp4');
            sockets.push(socket);

            socket.on('message', (data) => {
                try {
                    const response = decodeDnsResponse(data);
                    collector.addRecords(response.answers, response.resources);
                } catch {}
            });

            socket.on('error', () => {});
        }

        let interval: NodeJS.Timeout;

        // Wake devices first, then start querying
        Promise.all(hosts.map(h => knock(h))).then(() => {
            const sendQueries = () => {
                for (let i = 0; i < hosts.length; i++) {
                    for (const query of queries) {
                        sockets[i]?.send(query, MDNS_PORT, hosts[i]);
                    }
                }
            };

            sendQueries();
            interval = setInterval(sendQueries, 1000);
            setTimeout(finish, timeout * 1000);
        });
    });
}

export function multicast(services: string[], timeout: number = 4): Promise<MdnsService[]> {
    return new Promise((resolve) => {
        const collector = new ServiceCollector();
        const queries = createQueryPackets(services);
        const sockets: UdpSocket[] = [];
        let resolved = false;
        let interval: NodeJS.Timeout;

        const finish = () => {
            if (resolved) {
                return;
            }

            resolved = true;
            clearInterval(interval);

            for (const socket of sockets) {
                try {
                    socket.close();
                } catch {}
            }

            resolve(collector.services);
        };

        const onMessage = (data: Buffer) => {
            try {
                const response = decodeDnsResponse(data);
                collector.addRecords(response.answers, response.resources);
            } catch {}
        };

        const addSocket = (address: string | null, port: number): Promise<UdpSocket | null> => {
            return new Promise((resolveSocket) => {
                const socket = createSocket({ type: 'udp4', reuseAddr: true });
                socket.on('message', onMessage);

                socket.on('error', () => {
                    resolveSocket(null);
                });

                socket.bind(port, address ?? '', () => {
                    if (address) {
                        try {
                            socket.setMulticastInterface(address);
                            socket.addMembership(MDNS_ADDRESS, address);
                        } catch {}
                    } else {
                        try {
                            socket.addMembership(MDNS_ADDRESS);
                        } catch {}
                    }

                    sockets.push(socket);
                    resolveSocket(socket);
                });
            });
        };

        const getPrivateAddresses = (): string[] => {
            try {
                const { networkInterfaces } = require('node:os');
                const interfaces = networkInterfaces();
                const addresses: string[] = [];

                for (const nets of Object.values(interfaces)) {
                    for (const net of (nets as any[])) {
                        if (net.family === 'IPv4' && net.internal === false) {
                            addresses.push(net.address);
                        }
                    }
                }

                return addresses;
            } catch {
                return [];
            }
        };

        const setup = async () => {
            // Socket on 0.0.0.0:5353 to receive multicast responses (may fail on Homey)
            await addSocket(null, MDNS_PORT);

            // One socket per local interface on random port, with multicast membership
            for (const address of getPrivateAddresses()) {
                await addSocket(address, 0);
            }

            if (sockets.length === 0) {
                resolve([]);
                return;
            }

            const sendQueries = () => {
                for (const socket of sockets) {
                    for (const query of queries) {
                        try {
                            socket.send(query, MDNS_PORT, MDNS_ADDRESS);
                        } catch {}
                    }
                }
            };

            sendQueries();
            interval = setInterval(sendQueries, 1000);
            setTimeout(finish, timeout * 1000);
        };

        setup();
    });
}
