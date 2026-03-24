/**
 * Decodes an NSKeyedArchiver binary plist into plain JavaScript objects.
 * Resolves CF$UID references, decodes NS.objects/NS.keys into arrays/dicts,
 * and strips $class metadata.
 *
 * @param archive - The parsed plist archive containing `$objects` and `$top` keys.
 * @returns The resolved root object, or null if the archive is invalid.
 */
export function decode(archive: any): unknown {
    const objects = archive?.['$objects'];
    const top = archive?.['$top'];

    if (!objects || !top) {
        return null;
    }

    const resolve = (ref: unknown): unknown => {
        if (ref && typeof ref === 'object' && 'CF$UID' in (ref as any)) {
            return resolve(objects[(ref as any)['CF$UID']]);
        }

        if (ref === '$null') {
            return null;
        }

        if (ref && typeof ref === 'object') {
            const obj = ref as Record<string, unknown>;

            // NSArray
            if (obj['NS.objects'] && Array.isArray(obj['NS.objects'])) {
                return (obj['NS.objects'] as unknown[]).map(resolve);
            }

            // NSDictionary
            if (obj['NS.keys'] && Array.isArray(obj['NS.keys'])) {
                const keys = (obj['NS.keys'] as unknown[]).map(resolve) as string[];
                const values = (obj['NS.objects'] as unknown[]).map(resolve);
                const result: Record<string, unknown> = {};

                for (let i = 0; i < keys.length; i++) {
                    result[keys[i]] = values[i];
                }

                return result;
            }

            // Plain object — resolve all values, skip $class metadata
            const result: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(obj)) {
                if (key === '$class' || key === '$classname' || key === '$classes') {
                    continue;
                }

                result[key] = resolve(value);
            }

            return result;
        }

        return ref;
    };

    return resolve(top.root ?? top);
}

/**
 * Decodes an NSKeyedArchiver plist and returns the root as an array.
 * If the root is not an array, wraps it in one.
 *
 * @param archive - The parsed plist archive containing `$objects` and `$top` keys.
 * @returns The resolved root as an array. Non-array roots are wrapped in a single-element array.
 */
export function decodeAsArray(archive: any): unknown[] {
    const root = decode(archive);
    return Array.isArray(root) ? root : [root];
}
