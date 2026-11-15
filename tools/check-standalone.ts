// Fails when the dist of a standalone package imports anything but `node:*` builtins or its own files.
// Usage: bun tools/check-standalone.ts <packageDir>...
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\/\/\/\s*<reference\s+(?:types|path)=)['"]([^'"]+)['"]/g;

function isAllowed(specifier: string): boolean {
    return specifier.startsWith('node:') || specifier.startsWith('./') || specifier === 'node';
}

const failures: string[] = [];

for (const packageDir of process.argv.slice(2)) {
    const distDir = join(packageDir, 'dist');
    const files = readdirSync(distDir).filter((file) => /\.(mjs|js|d\.mts)$/.test(file));

    if (files.length === 0) {
        failures.push(`${distDir}: no build output`);
    }

    for (const file of files) {
        const source = readFileSync(join(distDir, file), 'utf8');

        for (const match of source.matchAll(SPECIFIER)) {
            if (!isAllowed(match[1])) {
                failures.push(`${join(distDir, file)}: imports '${match[1]}'`);
            }
        }
    }
}

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
