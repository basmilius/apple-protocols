import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStorage } from '../src/storage';

test('atomically saves private storage and rejects malformed input', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'apple-storage-test-'));
    try {
        const path = join(directory, 'storage.json');
        const storage = new JsonStorage(path);
        storage.setDevice('test', {identifier: 'test', name: 'Test'});
        await storage.save();
        await storage.save();
        assert.deepEqual(readdirSync(directory), ['storage.json']);
        if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
        assert.equal(JSON.parse(readFileSync(path, 'utf8')).devices.test.name, 'Test');
        const loaded = new JsonStorage(path);
        await loaded.load();
        assert.equal(loaded.getDevice('test')?.name, 'Test');
        writeFileSync(path, '{"version":1,"devices":null,"credentials":{}}');
        await assert.rejects(loaded.load(), /schema/);
        assert.equal(loaded.getDevice('test')?.name, 'Test');
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
