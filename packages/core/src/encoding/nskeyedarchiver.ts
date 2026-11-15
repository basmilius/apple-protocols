/**
 * Decodes an NSKeyedArchiver plist into plain objects. It resolves `CF$UID` references, turns
 * NSArray and NSDictionary into arrays and objects, and drops the class metadata.
 *
 * @param archive - The parsed plist, with `$objects` and `$top`.
 * @returns The root object, or null when the archive lacks `$objects` or `$top`.
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

            // An NSDictionary carries NS.objects as well, so it must be matched before NSArray.
            if (Array.isArray(obj['NS.keys']) && Array.isArray(obj['NS.objects'])) {
                const keys = (obj['NS.keys'] as unknown[]).map(resolve) as string[];
                const values = (obj['NS.objects'] as unknown[]).map(resolve);
                const result: Record<string, unknown> = {};

                for (let i = 0; i < keys.length; i++) {
                    result[keys[i]] = values[i];
                }

                return result;
            }

            if (Array.isArray(obj['NS.objects'])) {
                return (obj['NS.objects'] as unknown[]).map(resolve);
            }

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

/** Like {@link decode}, but wraps a root that is not an array in a single-element array. */
export function decodeAsArray(archive: any): unknown[] {
    const root = decode(archive);

    return Array.isArray(root) ? root : [root];
}
