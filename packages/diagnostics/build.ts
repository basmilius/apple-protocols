import { build, clean, dts } from '@basmilius/tools';
import type { Build } from 'bun';

type Target = [outfile: string, target: Build.CompileTarget];

const targets: Target[] = [
    ['ap-diagnostics-linux-arm64', 'bun-linux-arm64'],
    ['ap-diagnostics-linux-x64', 'bun-linux-x64'],
    ['ap-diagnostics-macos-arm64', 'bun-darwin-arm64'],
    ['ap-diagnostics-macos-x64', 'bun-darwin-x64'],
    ['ap-diagnostics-windows-x64.exe', 'bun-windows-x64']
];

const cleaner = clean('dist');
await cleaner.setup(undefined);

for (const [outfile, target] of targets) {
    console.log(`Building ${outfile}...`);

    await build({
        entrypoints: ['src/index.ts'],
        bytecode: true,
        minify: false,
        sourcemap: 'none',
        target: 'bun',
        plugins: [
            dts()
        ],
        external: [],
        compile: {outfile, target}
    });
}
