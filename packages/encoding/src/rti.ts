import * as Plist from './plist';

export type TextInputSession = {
    readonly uuid: Uint8Array;
    readonly documentText: string;
    readonly isSecure: boolean;
    readonly keyboardType: number;
    readonly autocorrection: boolean;
    readonly autocapitalization: boolean;
};

/** Reads RTIKeyedArchiver roots without exposing bytes outside the supplied view. */
export function decodeSession(data: Uint8Array | ArrayBuffer): TextInputSession {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const archive = Plist.parse(Uint8Array.from(bytes).buffer) as any;
    const objects = archive?.$objects;
    if (!Array.isArray(objects) || !archive?.$top) {
        throw new Error('Invalid RTI archive.');
    }

    const resolve = (value: any, depth = 0): any => {
        if (depth > 64) throw new Error('Invalid RTI archive reference cycle.');
        if (value === '$null') return null;
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
        if (!value || typeof value !== 'object') return value;
        if ('CF$UID' in value) {
            const index = value['CF$UID'];
            if (!Number.isInteger(index) || index < 0 || index >= objects.length) {
                throw new Error('Invalid RTI archive reference.');
            }
            return resolve(objects[index], depth + 1);
        }
        if (Array.isArray(value)) return value.map(item => resolve(item, depth + 1));
        const result: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) {
            if (key !== '$class') result[key] = resolve(item, depth + 1);
        }
        return result;
    };

    const roots = resolve(archive.$top);
    const root = roots.root ?? roots;
    const uuidValue = root.sessionUUID?.['NS.uuidbytes'];
    const uuid = uuidValue instanceof ArrayBuffer ? new Uint8Array(uuidValue)
        : uuidValue instanceof Uint8Array ? uuidValue : null;
    if (!uuid || uuid.byteLength !== 16) throw new Error('Invalid RTI session UUID.');
    const document = root.documentState ?? {};
    const traits = root.documentTraits ?? {};
    const text = document.docSt ?? document.documentContextBeforeInput ?? '';
    const documentText = typeof text === 'string' ? text : text?.['NS.string'] ?? '';
    return {
        uuid: Uint8Array.from(uuid),
        documentText: typeof documentText === 'string' ? documentText : '',
        isSecure: !!traits.secureTextEntry,
        keyboardType: Number(traits.keyboardType ?? 0),
        autocorrection: Number(traits.autocorrectionType ?? 0) === 2,
        autocapitalization: Number(traits.autocapitalizationType ?? 0) !== 0
    };
}

const uid = (index: number): { 'CF$UID': number } => ({'CF$UID': index});

/** RTITextOperations / TIKeyboardOutput, matching Apple's RTIKeyedArchiver layout. */
export function encodeOperation(sessionUUID: Uint8Array, text: string, clear: boolean): ArrayBuffer {
    if (sessionUUID.byteLength !== 16) throw new Error('Invalid RTI session UUID.');
    return Plist.serialize({
        '$version': 100000,
        '$archiver': 'RTIKeyedArchiver',
        '$top': {textOperations: uid(1)},
        '$objects': [
            '$null',
            {$class: uid(7), targetSessionUUID: uid(5), keyboardOutput: uid(2), ...(clear ? {textToAssert: uid(3)} : {})},
            {$class: uid(4), ...(clear ? {} : {insertionText: uid(3)})},
            clear ? '' : text,
            {$classname: 'TIKeyboardOutput', $classes: ['TIKeyboardOutput', 'NSObject']},
            {'NS.uuidbytes': Uint8Array.from(sessionUUID).buffer, $class: uid(6)},
            {$classname: 'NSUUID', $classes: ['NSUUID', 'NSObject']},
            {$classname: 'RTITextOperations', $classes: ['RTITextOperations', 'NSObject']}
        ]
    } as any) as ArrayBuffer;
}
