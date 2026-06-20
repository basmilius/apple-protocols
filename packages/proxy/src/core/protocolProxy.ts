/**
 * A protocol-specific proxy that the binary can start and stop. Companion Link implements this first;
 * AirPlay (with its multiple listeners) slots in later behind the same interface so the CLI and the
 * shared core (mDNS responder, framed transport, HAP server-side pairing, tap logger) are reused.
 */
export interface ProtocolProxy {
    /** A short identifier for the protocol (e.g. "companion-link"). */
    readonly name: string;

    /** Starts advertising and listening for controllers. */
    start(): Promise<void>;

    /** Stops the proxy and releases its resources. */
    stop(): Promise<void>;
}
