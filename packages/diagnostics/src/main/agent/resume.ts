import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PATH = join(homedir(), '.config', 'apple-protocols', 'diagnostics-agent-resume.json');

/** Restores explicitly connected devices after `electron-vite dev --watch` restarts main. */
export class ResumeList {
    #deviceIds = new Set<string>();

    get deviceIds(): readonly string[] {
        return Array.from(this.#deviceIds);
    }

    async load(): Promise<void> {
        try {
            const parsed = JSON.parse(await readFile(PATH, 'utf8'));

            this.#deviceIds = new Set(Array.isArray(parsed.deviceIds) ? parsed.deviceIds : []);
        } catch {
            this.#deviceIds = new Set();
        }
    }

    async add(deviceId: string): Promise<void> {
        this.#deviceIds.add(deviceId);
        await this.#save();
    }

    async remove(deviceId: string): Promise<void> {
        this.#deviceIds.delete(deviceId);
        await this.#save();
    }

    async #save(): Promise<void> {
        await mkdir(dirname(PATH), {recursive: true});
        await writeFile(PATH, JSON.stringify({deviceIds: this.deviceIds}, null, 4));
    }
}
