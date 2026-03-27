import type { Storage } from '@basmilius/apple-common';
import { reporter } from '@basmilius/apple-common';

/**
 * Global SDK configuration options.
 */
export type SdkConfig = {
    /** Storage backend for credentials. Default: none (consumer manages storage). */
    readonly storage?: Storage;
    /** Enable debug logging groups. Default: none. */
    readonly logging?: ('debug' | 'error' | 'info' | 'net' | 'raw' | 'warn')[];
};

let globalStorage: Storage | undefined;

/**
 * Configures global settings for the Apple SDK.
 * Should be called once before creating any device instances.
 */
export function configure(config: SdkConfig): void {
    if (config.storage) {
        globalStorage = config.storage;
    }

    if (config.logging) {
        reporter.none();

        for (const group of config.logging) {
            reporter.enable(group);
        }
    }
}

/** @internal Returns the globally configured storage, if any. */
export function getGlobalStorage(): Storage | undefined {
    return globalStorage;
}
