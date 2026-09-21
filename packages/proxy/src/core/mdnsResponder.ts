import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import type { Context } from '@basmilius/apple-common';

/** IPv4 multicast address for mDNS (RFC 6762). */
const MDNS_ADDRESS = '224.0.0.251';

/** Standard mDNS port. */
const MDNS_PORT = 5353;

/** DNS record type codes. */
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

/** Default record TTL in seconds. */
const TTL = 120;

/** Describes the service the responder advertises. */
export type AdvertisedService = {
    /** The Bonjour instance name (e.g. "AppleProtocols Proxy"). */
    readonly instance: string;
    /** The service type (e.g. "_companion-link._tcp.local"). */
    readonly type: string;
    /** The host name to publish (e.g. "apple-protocols-proxy.local"). */
    readonly host: string;
    /** The TCP port the service listens on. */
    readonly port: number;
    /** The TXT record key/value pairs. */
    readonly txt: Record<string, string>;
};

/**
 * Advertises one proxy service through periodic PTR/SRV/TXT/A multicasts and replies to queries mentioning its type.
 * Does not fully parse DNS questions; intended for quiet test networks. Controller discovery may require device-specific instance names and TXT records.
 */
export class MdnsResponder {
    readonly #context: Context;
    readonly #service: AdvertisedService;
    readonly #address: string;
    #socket?: UdpSocket;
    #timer?: NodeJS.Timeout;

    /**
     * @param service - The service to advertise.
     * @param address - The local IPv4 address to publish in the A record.
     */
    constructor(context: Context, service: AdvertisedService, address: string = MdnsResponder.localAddress()) {
        this.#context = context;
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

    /** Binds the multicast socket and starts periodically announcing the service. */
    start(): void {
        const socket = createSocket({type: 'udp4', reuseAddr: true});

        socket.on('error', (error) => {
            this.#context.logger.warn('[proxy]', 'mDNS responder socket error', error.message);
        });

        socket.on('message', (data: Buffer) => {
            // Re-announce on any query that mentions our service type. The QR bit (top bit of the flags
            // field at offset 2) is 0 for queries; ignore responses to avoid feedback loops.
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
                // Membership may fail if another responder owns the port; we can still send.
            }

            this.#context.logger.info('[proxy]', `Advertising ${this.#service.instance} ${this.#service.type} on ${this.#address}:${this.#service.port}`);
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

    /** Builds and multicasts the full record set. */
    #announce(): void {
        if (!this.#socket) {
            return;
        }

        const message = this.#buildResponse();

        try {
            this.#socket.send(message, MDNS_PORT, MDNS_ADDRESS);
        } catch (error) {
            this.#context.logger.warn('[proxy]', 'mDNS announce failed', (error as Error).message);
        }
    }

    /** Encodes the PTR + SRV + TXT + A answer records into a single mDNS response packet. */
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

/** Encodes a domain name as length-prefixed DNS labels terminated by a zero byte. */
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

/** Wraps rdata in a resource record (name, type, class, ttl, rdlength, rdata). */
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
