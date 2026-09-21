import type { ChannelContext } from './context';
import { registerAudioChannels } from './media/audio';
import { registerPairingChannels } from './media/pairing';
import { registerRaopChannels } from './media/raop';
import { registerRawChannels } from './media/raw';
import { registerRecoveryChannels } from './media/recovery';

export function registerMediaChannels(context: ChannelContext): void {
    registerPairingChannels(context);
    registerAudioChannels(context);
    registerRaopChannels(context);
    registerRawChannels(context);
    registerRecoveryChannels(context);
}
