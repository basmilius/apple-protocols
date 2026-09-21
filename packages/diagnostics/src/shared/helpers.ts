import type { Bytes } from './contract';

/** Whether a serialized value is the hex form of a `Uint8Array` or a `Buffer`. */
export function isBytes(value: unknown): value is Bytes {
    return typeof value === 'object' && value !== null && typeof (value as Bytes).$bytes === 'string';
}

/**
 * Formats seconds as `m:ss` or `h:mm:ss`. Anything that is not a finite number reads as `--:--`,
 * which is what a device without a duration reports.
 */
export function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--:--';
    }

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    }

    return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** `14:03:07.482`, the stamp the log console and the event table print. */
export function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    return `${time}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}
