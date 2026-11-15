import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import type { Logger } from '../reporter';

/** The IPv4 multicast address of mDNS, from RFC 6762. */
const MDNS_ADDRESS = '224.0.0.251';

const MDNS_PORT = 5353;

/** The DNS record types that the responder writes. */
const Type = {
    A: 0x01,
    PTR: 0x0C,
    TXT: 0x10,
    SRV: 0x21
} as const;

/** Class IN with the cache-flush bit set, used for records unique to this host. */
const CLASS_FLUSH = 0x8001;

/** Class IN, used for the shared PTR record. */
const CLASS_IN = 0x0001;

/** The TTL of every record in seconds. */
const TTL = 120;

/** The service that an {@link MdnsResponder} advertises. */
export type AdvertisedService = {
    /** The DNS-SD instance name, which controllers show to the user. */
    readonly instance: string;

    /** The service type, such as `_companion-link._tcp.local`. */
    readonly type: string;

    /** The host name that the SRV and A records publish, ending in `.local`. */
    readonly host: string;

    /** The TCP port the service listens on. */
    readonly port: number;

    /** The properties of the TXT record. An empty value publishes the bare key. */
    readonly txt: Record<string, string>;
};

/**
 * Advertises one service with PTR, SRV, TXT and A records every 2 seconds, and again on each
 * query that mentions its type. It does not parse DNS questions, so it suits quiet test networks.
 * A controller can need the instance name and TXT record of a real device before it lists the service.
 */
export class MdnsResponder {
    readonly #logger: Logger;
    readonly #service: AdvertisedService;
    readonly #address: string;
    #socket?: UdpSocket;
    #timer?: NodeJS.Timeout;

    /**
     * @param address - The local IPv4 address that the A record publishes.
     */
    constructor(logger: Logger, service: AdvertisedService, address: string = MdnsResponder.localAddress()) {
        this.#logger = logger;
        this.#service = service;
        this.#address = address;
    }

    /** Returns the first non-internal IPv4 address of this host, or `0.0.0.0` if none is found. */
    static localAddress(): string {
        for (const nets of Object.values(networkInterfaces())) {
            for (const net of nets ?? []) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }

        return '0.0.0.0';
    }

    /** Binds the multicast socket and announces the service every 2 seconds. */
    start(): void {
        const socket = createSocket({type: 'udp4', reuseAddr: true});

        socket.on('error', (error) => {
            this.#logger.warn('[mdns]', 'mDNS responder socket error', error.message);
        });

        socket.on('message', (data: Buffer) => {
            // Announce again on a query that mentions the service type. The QR bit, the top bit of the
            // flags at offset 2, is 0 for a query. Answering responses would start a feedback loop.
            const isQuery = (data.readUInt16BE(2) & 0x8000) === 0;

            if (isQuery && data.includes(Buffer.from(this.#service.type.split('.')[0]))) {
                this.#announce();
            }
        });

        socket.bind(MDNS_PORT, () => {
            try {
                socket.addMembership(MDNS_ADDRESS);
                socket.setMulticastTTL(255);
            } catch {
                // Membership fails when another responder owns the port; sending still works.
            }

            this.#logger.info('[mdns]', `Advertising ${this.#service.instance} ${this.#service.type} on ${this.#address}:${this.#service.port}`);
            this.#announce();
        });

        this.#socket = socket;
        this.#timer = setInterval(() => this.#announce(), 2000);
    }

    /** Stops announcing and closes the socket. */
    stop(): void {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = undefined;
        }

        try {
            this.#socket?.close();
        } catch {
        }

        this.#socket = undefined;
    }

    /** Multicasts the full record set. */
    #announce(): void {
        if (!this.#socket) {
            return;
        }

        const message = this.#buildResponse();

        try {
            this.#socket.send(message, MDNS_PORT, MDNS_ADDRESS);
        } catch (error) {
            this.#logger.warn('[mdns]', 'mDNS announce failed', (error as Error).message);
        }
    }

    /** Encodes the PTR, SRV, TXT and A records as one mDNS response. */
    #buildResponse(): Buffer {
        const instanceFqdn = `${this.#service.instance}.${this.#service.type}`;

        const header = Buffer.allocUnsafe(12);
        header.writeUInt16BE(0, 0); // id
        header.writeUInt16BE(0x8400, 2); // flags: response + authoritative
        header.writeUInt16BE(0, 4); // qdcount
        header.writeUInt16BE(4, 6); // ancount
        header.writeUInt16BE(0, 8); // nscount
        header.writeUInt16BE(0, 10); // arcount

        const ptr = record(this.#service.type, Type.PTR, CLASS_IN, encodeName(instanceFqdn));
        const srv = record(instanceFqdn, Type.SRV, CLASS_FLUSH, encodeSrv(this.#service.port, this.#service.host));
        const txt = record(instanceFqdn, Type.TXT, CLASS_FLUSH, encodeTxt(this.#service.txt));
        const a = record(this.#service.host, Type.A, CLASS_FLUSH, encodeAddress(this.#address));

        return Buffer.concat([header, ptr, srv, txt, a]);
    }
}

/** Encodes a domain name as length-prefixed DNS labels and a closing zero byte. A label keeps at most 63 bytes. */
function encodeName(name: string): Buffer {
    const parts: Buffer[] = [];

    for (const label of name.split('.')) {
        if (label.length === 0) {
            continue;
        }

        const encoded = Buffer.from(label, 'utf8').subarray(0, 63);
        parts.push(Buffer.from([encoded.byteLength]), encoded);
    }

    parts.push(Buffer.from([0x00]));

    return Buffer.concat(parts);
}

/** Wraps rdata in a resource record: name, type, class, TTL, rdata length and rdata. */
function record(name: string, type: number, recordClass: number, rdata: Buffer): Buffer {
    const head = encodeName(name);
    const meta = Buffer.allocUnsafe(10);
    meta.writeUInt16BE(type, 0);
    meta.writeUInt16BE(recordClass, 2);
    meta.writeUInt32BE(TTL, 4);
    meta.writeUInt16BE(rdata.byteLength, 8);

    return Buffer.concat([head, meta, rdata]);
}

/** Encodes SRV rdata: priority, weight, port and the target host name. */
function encodeSrv(port: number, host: string): Buffer {
    const head = Buffer.allocUnsafe(6);
    head.writeUInt16BE(0, 0); // priority
    head.writeUInt16BE(0, 2); // weight
    head.writeUInt16BE(port, 4);

    return Buffer.concat([head, encodeName(host)]);
}

/** Encodes TXT rdata as a sequence of length-prefixed `key=value` strings. */
function encodeTxt(txt: Record<string, string>): Buffer {
    const parts: Buffer[] = [];

    for (const [key, value] of Object.entries(txt)) {
        const entry = Buffer.from(value === '' ? key : `${key}=${value}`, 'utf8').subarray(0, 255);
        parts.push(Buffer.from([entry.byteLength]), entry);
    }

    if (parts.length === 0) {
        parts.push(Buffer.from([0x00]));
    }

    return Buffer.concat(parts);
}

/** Encodes an IPv4 dotted-quad address as 4 bytes. */
function encodeAddress(address: string): Buffer {
    const octets = address.split('.').map((part) => Number.parseInt(part, 10) & 0xFF);

    return Buffer.from(octets.length === 4 ? octets : [0, 0, 0, 0]);
}
