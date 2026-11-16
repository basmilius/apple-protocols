import { reporter } from '@apple-protocols/core';
import { HKDF } from '@apple-protocols/core/crypto';
import { Plist } from '@apple-protocols/core/encoding';
import type { Context } from '@apple-protocols/core/transport';
import { decodeNestedCommand, type PlayQueueCommand } from '../playback/playQueue';
import { buildResponse, type Method, parseRequest } from '../rtsp';
import { EncryptedChannel, type ChannelKeys } from './encrypted';

/** Requests the receiver sends us over the event channel. */
export type EventChannelEventMap = {
    /** Any `POST /command`, with its plist body. */
    command: [data: Record<string, unknown>];

    /** A play queue command (playback state, notification, unhandledURL) decoded from `params.data` of a `POST /command`. */
    playQueue: [event: PlayQueueCommand];

    /** The receiver asks to duck audio, for instance for Siri. */
    duckAudio: [data: Record<string, unknown>];
    unduckAudio: [data: Record<string, unknown>];

    /** The receiver ended the session. */
    sessionDied: [];
};

/**
 * The reverse RTSP channel: the receiver is the client here and we answer its requests. Every
 * request gets `200 OK`; `POST /command` bodies become events.
 */
export class EventChannel extends EncryptedChannel<EventChannelEventMap> {
    constructor(context: Context, address: string, port: number, sharedSecret: Buffer) {
        super(context, address, port, eventKeys(sharedSecret));
    }

    /** Sends a response to a request of the receiver. */
    respond(status: number, statusText: string, headers?: Record<string, string | number>, body?: Buffer): void {
        const data = buildResponse({status, statusText, headers, body});

        this.context.logger.traffic('eventStream', 'out', `${status} ${statusText}`, {headers}, data);

        this.writeEncrypted(data);
    }

    protected receive(plaintext: Buffer): number {
        let offset = 0;

        while (plaintext.byteLength > offset) {
            const result = parseRequest(plaintext.subarray(offset));

            if (result === null) {
                break;
            }

            if (reporter.tapsTraffic) {
                this.context.logger.traffic('eventStream', 'in', `${result.method} ${result.path}`, {headers: result.headers, body: withNestedCommand(decodePlist(result.body))}, Buffer.from(plaintext.subarray(offset, offset + result.requestLength)));
            }

            offset += result.requestLength;
            this.#handle(result.method, result.path, result.headers, result.body);
        }

        return offset;
    }

    #handle(method: Method, path: string, headers: Record<string, string>, body: Buffer): void {
        const key = `${method} ${path}`;

        if (key !== 'POST /command') {
            this.context.logger.warn('[event]', 'No handler for url', key);
            this.respond(200, 'OK', {'CSeq': headers['CSeq'] ?? 0});

            return;
        }

        const data = Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer) as Record<string, unknown>;
        const commandType = data.type as string | undefined;

        this.context.logger.info('[event]', 'Received command:', commandType ?? 'unknown', data);

        this.emit('command', data);

        if (commandType === 'cycleUsePickedRoute' || commandType === 'duckAudio') {
            this.emit('duckAudio', data);
        } else if (commandType === 'unduckAudio') {
            this.emit('unduckAudio', data);
        } else if (commandType === 'died') {
            this.emit('sessionDied');
        }

        this.respond(200, 'OK', {
            'Audio-Latency': 0,
            'CSeq': headers['CSeq'] ?? 0
        });

        const playQueueCommand = decodeNestedCommand(data);

        if (playQueueCommand) {
            this.context.logger.info('[event]', 'Received play queue command:', playQueueCommand.type ?? 'unknown', playQueueCommand);
            this.emit('playQueue', playQueueCommand);
        }
    }
}

/**
 * The HKDF infos are named from the receiver's side, because the receiver originates this
 * connection. The keys are swapped on purpose: `Events-Write-Encryption-Key` is what the
 * receiver writes, which we read.
 */
function eventKeys(sharedSecret: Buffer): ChannelKeys {
    const {readKey, writeKey} = HKDF.deriveEncryptionKeys(sharedSecret, 'Events-Salt', 'Events-Read-Encryption-Key', 'Events-Write-Encryption-Key');

    return {
        readKey: writeKey,
        writeKey: readKey
    };
}

function decodePlist(body: Buffer): unknown {
    if (body.byteLength === 0) {
        return undefined;
    }

    try {
        return Plist.parse(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
    } catch {
        return undefined;
    }
}

/** Replaces the binary plist in `params.data` by its decoded command, for the traffic sink. */
function withNestedCommand(body: unknown): unknown {
    const command = decodeNestedCommand(body);

    if (!command) {
        return body;
    }

    const outer = body as {params: Record<string, unknown>};

    return {...outer, params: {...outer.params, data: command}};
}
