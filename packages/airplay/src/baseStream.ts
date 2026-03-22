import { EncryptionAwareConnection, type EventMap } from '@basmilius/apple-common';
import { chacha20Decrypt, chacha20Encrypt } from './encryption';

type DefaultEventMap = {
    close: [];
    connect: [];
    error: [Error];
    timeout: [];
};

export default class BaseStream<TEventMap extends EventMap = {}> extends EncryptionAwareConnection<DefaultEventMap & TEventMap> {
    decrypt(data: Buffer): Buffer | false {
        return chacha20Decrypt(this._encryption, data);
    }

    encrypt(data: Buffer): Buffer {
        return chacha20Encrypt(this._encryption, data);
    }
}
