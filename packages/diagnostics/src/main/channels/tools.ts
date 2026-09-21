import type { CallResult, ToolInfo } from '@shared/contract';
import { handle } from '../ipc';
import { serialize, serializeError } from '../serialize';
import type { ChannelContext } from './context';
import { ENCODING_TOOLS } from './tools/encoding';
import { ENCRYPTION_TOOLS } from './tools/encryption';
import { FEATURE_TOOLS } from './tools/features';
import * as mdns from './tools/mdns';
import type { ToolDefinition } from './tools/registry';
import { listDevices, readStorage, removeCredentials, removeDevice } from './tools/storage';

const TOOLS: readonly ToolDefinition[] = [...ENCODING_TOOLS, ...ENCRYPTION_TOOLS, ...FEATURE_TOOLS];

const descriptors: readonly ToolInfo[] = TOOLS.map(({id, title, description, category, section, inputs}) => ({id, title, description, category, section, inputs}));

/** Use the device-call result shape so tools share the renderer's error handling. */
async function run(tool: ToolDefinition | undefined, toolId: string, args: Readonly<Record<string, unknown>>): Promise<CallResult> {
    const started = Date.now();

    try {
        if (tool === undefined) {
            throw new Error(`Unknown tool '${toolId}'.`);
        }

        return {ok: true, kind: 'call', value: serialize(await tool.run(args)), durationMs: Date.now() - started};
    } catch (error) {
        return {ok: false, error: serializeError(error)};
    }
}

export function registerToolsChannels(context: ChannelContext): void {
    handle('tool:list', () => descriptors);
    handle('tool:run', async request => await run(TOOLS.find(tool => tool.id === request.toolId), request.toolId, request.args));

    handle('storage:devices', () => listDevices(context.storage));
    handle('storage:read', request => readStorage(context.storage, request?.reveal === true));
    handle('storage:removeCredentials', async request => {
        await removeCredentials(context.storage, request.deviceId, request.protocol);
    });
    handle('storage:removeDevice', async request => {
        await removeDevice(context.storage, request.deviceId);
    });

    handle('mdns:scan', async request => await mdns.scan(request));
    handle('mdns:wake', async request => {
        await mdns.wake(request.address);
    });

    handle('discoverytools:findByAddress', async request => await mdns.findByAddress(request.service, request.address, request.timeoutMs));
    handle('discoverytools:findUntil', async request => await mdns.findUntil(request.service, request.id, request.tries, request.timeoutMs));
    handle('discoverytools:discoverAll', async () => await mdns.discoverAll());
    handle('discoverytools:clearCache', () => {
        mdns.clearCache();
    });
}
