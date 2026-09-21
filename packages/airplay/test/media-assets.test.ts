import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getExtension } from '@bufbuild/protobuf';
import { DataStreamMessage, Proto } from '../src';

test('animated format requests are opt-in and lyrics remain enabled', () => {
    const plain = getExtension(DataStreamMessage.playbackQueueRequest(0, 1)[0], Proto.playbackQueueRequestMessage);
    assert.equal(plain.includeLyrics, true);
    assert.equal(plain.includeAvailableArtworkFormats, false);
    assert.deepEqual(plain.requestedAnimatedArtworkAssetURLFormats, []);
    const animated = getExtension(DataStreamMessage.playbackQueueRequest(0, 1, 600, -1, {
        requestedAnimatedArtworkAssetURLFormats: ['MRContentItemAnimatedArtworkFormatSquare']
    })[0], Proto.playbackQueueRequestMessage);
    assert.deepEqual(animated.requestedAnimatedArtworkAssetURLFormats, ['MRContentItemAnimatedArtworkFormatSquare']);
});

