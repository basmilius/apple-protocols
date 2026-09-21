import {
    AirPlayFeatureFlags,
    describeFlags,
    getDeviceModelName,
    getDeviceType,
    getPairingRequirement,
    getProtocolVersion,
    isAirPort,
    isAppleTV,
    isHomePod,
    isPasswordRequired,
    isRemoteControlSupported,
    lookupDeviceModel,
    parseFeatures
} from '@basmilius/apple-common';
import { readString } from './bytes';
import type { ToolDefinition } from './registry';

/** Synthesize a TXT record when only a features string is supplied, so pairing checks can still run. */
const readTxt = (args: Readonly<Record<string, unknown>>, features: string): Record<string, string> => {
    const text = readString(args, 'txt').trim();
    const parsed = text.length === 0 ? {} : (JSON.parse(text) as Record<string, string>);

    return features.length === 0 ? parsed : {features, ...parsed};
};

export const FEATURE_TOOLS: readonly ToolDefinition[] = [
    {
        id: 'features.decode',
        title: 'Decode AirPlay features',
        description: 'Turns a features TXT value into the flags it sets, and reads what the record says about pairing.',
        category: 'features',
        section: 'Feature flags',
        inputs: [
            {name: 'features', label: 'Features', type: 'text', placeholder: '0x4A7FDFD5,0xBC157FDE'},
            {name: 'txt', label: 'TXT record (JSON)', type: 'textarea', placeholder: '{"model": "AppleTV14,1", "flags": "0x244"}', rows: 4, optional: true}
        ],
        run: args => {
            const features = readString(args, 'features').trim();
            const txt = readTxt(args, features);
            const mask = features.length === 0 ? 0n : parseFeatures(features);
            const flags = describeFlags(mask);

            return {
                mask: `0x${mask.toString(16)}`,
                bits: mask.toString(2).padStart(64, '0'),
                flagCount: flags.length,
                flags,
                pairing: getPairingRequirement(txt),
                protocolVersion: getProtocolVersion(txt),
                passwordRequired: isPasswordRequired(txt),
                remoteControlSupported: isRemoteControlSupported(txt)
            };
        }
    },
    {
        id: 'features.catalog',
        title: 'List every known flag',
        description: 'Every flag name this stack knows, with the bit it occupies.',
        category: 'features',
        section: 'Feature flags',
        inputs: [],
        run: () =>
            Object.entries(AirPlayFeatureFlags).map(([name, flag]) => ({
                name,
                mask: `0x${flag.toString(16)}`,
                bit: flag.toString(2).length - 1
            }))
    },
    {
        id: 'device.model',
        title: 'Look up a device model',
        description: 'Resolves a model identifier such as AppleTV14,1 or AudioAccessory5,1 to its marketing name and family.',
        category: 'features',
        section: 'Device model',
        inputs: [{name: 'identifier', label: 'Model identifier', type: 'text', placeholder: 'AppleTV14,1', default: 'AppleTV14,1'}],
        run: args => {
            const identifier = readString(args, 'identifier').trim();
            const model = lookupDeviceModel(identifier);

            return {
                identifier,
                model,
                name: getDeviceModelName(model),
                type: getDeviceType(model),
                isAppleTV: isAppleTV(model),
                isHomePod: isHomePod(model),
                isAirPort: isAirPort(model)
            };
        }
    }
];
