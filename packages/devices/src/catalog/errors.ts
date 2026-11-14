import { AppleProtocolError } from '@corewire/core';

/**
 * Why an Apple Music catalog lookup failed: arguments it cannot send (`invalidArgument`), a token
 * the catalog rejected (`unauthorized`, `forbidden`), a request that failed or timed out
 * (`requestFailed`), or an answer it could not read (`invalidResponse`, `tooLarge`).
 */
export type CatalogErrorReason = 'invalidArgument' | 'unauthorized' | 'forbidden' | 'requestFailed' | 'invalidResponse' | 'tooLarge';

/** An Apple Music catalog lookup failed. */
export class CatalogError extends AppleProtocolError {
    readonly reason: CatalogErrorReason;

    /** The HTTP status of the answer; null when there was none. */
    readonly status: number | null;

    constructor(reason: CatalogErrorReason, message: string, status: number | null = null) {
        super(message);
        this.name = 'CatalogError';
        this.reason = reason;
        this.status = status;
    }
}
