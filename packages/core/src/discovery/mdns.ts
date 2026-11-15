import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { createConnection } from 'node:net';

/** The IPv4 multicast address of mDNS, from RFC 6762. */
const MDNS_ADDRESS = '224.0.0.251';

const MDNS_PORT = 5353;
const QUERY_ID = 0x35FF;

/** The number of service questions in one DNS message. */
const SERVICES_PER_MSG = 3;

/** The DNS record types that discovery asks for and reads. */
const QueryType = {
    A: 0x01,
    PTR: 0x0C,
    TXT: 0x10,
    AAAA: 0x1C,
    SRV: 0x21,
    ANY: 0xFF
} as const;

/** An mDNS service instance, resolved to an address and port. */
export type MdnsService = {
    readonly name: string;
    readonly type: string;
    readonly address: string;
    readonly port: number;
    readonly properties: Record<string, string>;
};

/** The header of a DNS packet. */
type DnsHeader = {
    id: number;
    flags: number;
    qdcount: number;
    ancount: number;
    nscount: number;
    arcount: number;
};

/** A DNS resource record. */
type DnsResource = {
    qname: string;
    qtype: number;
    qclass: number;
    ttl: number;
    rdata: unknown;
};

/** The data of an SRV record, which locates a service instance. */
type SrvRecord = {
    priority: number;
    weight: number;
    port: number;
    target: string;
};

/**
 * Encodes a domain name as DNS labels, each prefixed with its length and the last followed
 * by a zero byte. A label longer than 63 bytes is cut off.
 */
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

/**
 * Splits a service name into DNS labels. An instance name can contain dots, so the split
 * happens at the service type: `Living Room._hap._tcp.local` gives
 * `['Living Room', '_hap', '_tcp', 'local']`.
 */
const splitServiceName = (name: string): string[] => {
    const servicePattern = /\._[a-z0-9-]+\._(?:tcp|udp)\.local$/;
    const match = name.match(servicePattern);

    if (match) {
        const instanceName = name.substring(0, match.index);
        const servicePart = match[0].substring(1);

        return [instanceName, ...servicePart.split('.')];
    }

    return name.split('.');
};

/**
 * Encodes the 12-byte DNS header.
 */
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

/**
 * Encodes one DNS question.
 *
 * @param unicastResponse - Sets the QU bit, which asks for a unicast response.
 */
const encodeDnsQuestion = (name: string, qtype: number, unicastResponse: boolean = false): Buffer => {
    const qname = encodeQName(name);
    const suffix = Buffer.allocUnsafe(4);
    suffix.writeUInt16BE(qtype, 0);
    suffix.writeUInt16BE(unicastResponse ? 0x8001 : 0x0001, 2);

    return Buffer.concat([qname, suffix]);
};

/**
 * Builds the DNS query packets for the service types, {@link SERVICES_PER_MSG} questions per packet.
 *
 * @param services - The mDNS service types, such as `_hap._tcp.local`.
 * @param unicastResponse - Sets the QU bit, which asks for a unicast response.
 */
export function createQueryPackets(services: string[], qtype: number = QueryType.PTR, unicastResponse: boolean = false): Buffer[] {
    const packets: Buffer[] = [];

    for (let i = 0; i < services.length; i += SERVICES_PER_MSG) {
        const chunk = services.slice(i, i + SERVICES_PER_MSG);
        const questions = chunk.map(service => encodeDnsQuestion(service, qtype, unicastResponse));

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

/** The number of compression pointers to follow in one name, so a pointer loop ends. */
const MAX_POINTER_JUMPS = 128;

/**
 * Decodes a DNS name and follows its compression pointers (RFC 1035 section 4.1.4).
 *
 * @returns The name and the offset after it in the packet.
 */
const decodeQName = (buf: Buffer, offset: number): [string, number] => {
    const labels: string[] = [];
    let currentOffset = offset;
    let jumped = false;
    let jumps = 0;
    let returnOffset = offset;

    while (currentOffset < buf.byteLength) {
        const length = buf[currentOffset];

        if (length === 0) {
            if (!jumped) {
                returnOffset = currentOffset + 1;
            }

            break;
        }

        // A compression pointer has both upper bits set.
        if ((length & 0xC0) === 0xC0) {
            if (++jumps > MAX_POINTER_JUMPS) {
                break;
            }

            const pointer = ((length & 0x3F) << 8) | buf[currentOffset + 1];

            if (!jumped) {
                returnOffset = currentOffset + 2;
            }

            currentOffset = pointer;
            jumped = true;

            continue;
        }

        currentOffset++;

        if (currentOffset + length > buf.byteLength) {
            break;
        }

        labels.push(buf.toString('utf-8', currentOffset, currentOffset + length));
        currentOffset += length;

        if (!jumped) {
            returnOffset = currentOffset;
        }
    }

    return [labels.join('.'), returnOffset];
};

/**
 * Decodes the 12-byte DNS header.
 */
const decodeDnsHeader = (buf: Buffer): DnsHeader => ({
    id: buf.readUInt16BE(0),
    flags: buf.readUInt16BE(2),
    qdcount: buf.readUInt16BE(4),
    ancount: buf.readUInt16BE(6),
    nscount: buf.readUInt16BE(8),
    arcount: buf.readUInt16BE(10)
});

/**
 * Decodes one DNS question.
 *
 * @returns The question and the offset after it.
 */
const decodeQuestion = (buf: Buffer, offset: number): [{ qname: string; qtype: number; qclass: number }, number] => {
    const [qname, newOffset] = decodeQName(buf, offset);
    const qtype = buf.readUInt16BE(newOffset);
    const qclass = buf.readUInt16BE(newOffset + 2);

    return [{ qname, qtype, qclass }, newOffset + 4];
};

/**
 * Decodes the data of a TXT record into properties. Each entry is a length-prefixed UTF-8
 * `key=value` string; an entry without `=` gets an empty value.
 */
const decodeTxtRecord = (buf: Buffer, offset: number, length: number): Record<string, string> => {
    const properties: Record<string, string> = {};
    let pos = offset;
    const end = offset + length;

    while (pos < end) {
        const entryLength = buf[pos];
        pos++;

        if (entryLength === 0 || pos + entryLength > end) {
            break;
        }

        const entry = buf.toString('utf-8', pos, pos + entryLength);
        pos += entryLength;

        const eqIndex = entry.indexOf('=');

        if (eqIndex >= 0) {
            properties[entry.substring(0, eqIndex)] = entry.substring(eqIndex + 1);
        } else {
            properties[entry] = '';
        }
    }

    return properties;
};

/**
 * Decodes the data of an SRV record.
 */
const decodeSrvRecord = (buf: Buffer, offset: number): SrvRecord => {
    const priority = buf.readUInt16BE(offset);
    const weight = buf.readUInt16BE(offset + 2);
    const port = buf.readUInt16BE(offset + 4);
    const [target] = decodeQName(buf, offset + 6);

    return { priority, weight, port, target };
};

/**
 * Decodes one resource record. The data of A, AAAA, PTR, SRV and TXT records is parsed;
 * other types keep their raw bytes.
 *
 * @returns The record and the offset after it, or null when the packet ends inside the record header.
 */
const decodeResource = (buf: Buffer, offset: number): [DnsResource, number] | null => {
    const [qname, nameEnd] = decodeQName(buf, offset);

    if (nameEnd + 10 > buf.byteLength) {
        return null;
    }

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

/**
 * Decodes a DNS response into its header, answers and additional records. The question and
 * authority sections are skipped.
 */
export function decodeDnsResponse(buf: Buffer): { header: DnsHeader; answers: DnsResource[]; resources: DnsResource[] } {
    const header = decodeDnsHeader(buf);
    let offset = 12;

    for (let i = 0; i < header.qdcount; i++) {
        const [, newOffset] = decodeQuestion(buf, offset);
        offset = newOffset;
    }

    const answers: DnsResource[] = [];

    for (let i = 0; i < header.ancount; i++) {
        const result = decodeResource(buf, offset);

        if (!result) {
            break;
        }

        const [record, newOffset] = result;
        answers.push(record);
        offset = newOffset;
    }

    for (let i = 0; i < header.nscount; i++) {
        const result = decodeResource(buf, offset);

        if (!result) {
            break;
        }

        offset = result[1];
    }

    const resources: DnsResource[] = [];

    for (let i = 0; i < header.arcount; i++) {
        const result = decodeResource(buf, offset);

        if (!result) {
            break;
        }

        const [record, newOffset] = result;
        resources.push(record);
        offset = newOffset;
    }

    return { header, answers, resources };
}

/**
 * Collects the records of several mDNS responses and joins their PTR, SRV, TXT and A records
 * into {@link MdnsService} values.
 */
class ServiceCollector {
    /** The instance names per service type, from PTR records. */
    readonly #ptrMap = new Map<string, Set<string>>();

    /** The SRV record per instance name. */
    readonly #srvMap = new Map<string, SrvRecord>();

    /** The TXT properties per instance name. */
    readonly #txtMap = new Map<string, Record<string, string>>();

    /** The IPv4 address per hostname, from A records. */
    readonly #addressMap = new Map<string, string>();

    /**
     * Sorts answer and additional records into the maps by record type.
     */
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

    /**
     * The services that have a PTR record, an SRV record with a nonzero port and an A record
     * for the SRV target.
     */
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

                if (!results.some(result => result.name === name && result.type === serviceType)) {
                    results.push({ name, type: serviceType, address, port: srv.port, properties: txt });
                }
            }
        }

        return results;
    }
}

/**
 * Opens a TCP connection to each port to wake a sleeping device before a query. The caller
 * knows which ports wake it. Resolves once every attempt settled.
 */
export function knock(address: string, ports: readonly number[]): Promise<void> {
    const promises = ports.map(port => new Promise<void>((resolve) => {
        const socket = createConnection({ host: address, port, timeout: 500 });
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('error', () => { socket.destroy(); resolve(); });
        socket.on('timeout', () => { socket.destroy(); resolve(); });
    }));

    return Promise.all(promises).then(() => {});
}

/**
 * Queries hosts with unicast DNS-SD. It knocks on the `wakePorts` of each host first, then
 * sends the queries to port 5353 of each host every second. It stops when `timeout` ends or
 * every host answered for every service.
 *
 * @param hosts - IP addresses of the hosts to query.
 * @param timeout - Duration in seconds.
 */
export function mdnsUnicast(hosts: string[], services: string[], timeout: number = 4, wakePorts: readonly number[] = []): Promise<MdnsService[]> {
    const expectedCount = hosts.length * services.length;

    return new Promise((resolve) => {
        const queries = createQueryPackets(services, QueryType.PTR, true);
        const collector = new ServiceCollector();
        const socket = createSocket('udp4');
        let resolved = false;

        const finish = () => {
            if (resolved) {
                return;
            }

            resolved = true;
            clearInterval(interval);

            try {
                socket.close();
            } catch {}

            resolve(collector.services.filter(service => services.includes(service.type)));
        };

        socket.on('message', (data) => {
            try {
                const response = decodeDnsResponse(data);
                collector.addRecords(response.answers, response.resources);

                if (collector.services.length >= expectedCount) {
                    finish();
                }
            } catch {}
        });

        socket.on('error', () => {});

        for (const host of hosts) {
            knock(host, wakePorts);
        }

        const sendQueries = () => {
            for (const host of hosts) {
                for (const query of queries) {
                    socket.send(query, MDNS_PORT, host);
                }
            }
        };

        let interval: NodeJS.Timeout;

        sendQueries();
        interval = setInterval(sendQueries, 1000);
        setTimeout(finish, timeout * 1000);
    });
}

/**
 * Discovers services with multicast DNS-SD on every local interface. It binds port 5353 when
 * it can, plus one socket on a random port per interface.
 *
 * @param timeout - Duration in seconds.
 */
export function mdnsMulticast(services: string[], timeout: number = 4): Promise<MdnsService[]> {
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

            resolve(collector.services.filter(service => services.includes(service.type)));
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
            // Port 5353 receives multicast responses. Binding it can fail, as it does on Homey.
            await addSocket(null, MDNS_PORT);

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
