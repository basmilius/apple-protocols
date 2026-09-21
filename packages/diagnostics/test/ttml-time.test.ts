import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLyricActive, lyricTime} from '../src/renderer/panels/playback/ttml';

test('reads Apple numeric seconds, clock values and millisecond offsets', () => {
    assert.equal(lyricTime('17.866'), 17.866);
    assert.equal(lyricTime('01:02.345'), 62.345);
    assert.equal(lyricTime('1:02:03.5'), 3723.5);
    assert.equal(lyricTime('500ms'), .5);
    assert.equal(lyricTime('2.5s'), 2.5);
    for (const value of [null, '', '-1', '00:61', 'wrong']) assert.equal(lyricTime(value), null);
});

test('highlighting includes the start and excludes the end; untimed text stays inactive', () => {
    const segment = {text: 'Example', begin: 10, end: 11};
    assert.equal(isLyricActive(segment, 9.999), false);
    assert.equal(isLyricActive(segment, 10), true);
    assert.equal(isLyricActive(segment, 11), false);
    assert.equal(isLyricActive({...segment, begin: null, end: null}, 10), false);
});
