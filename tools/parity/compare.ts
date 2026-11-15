// Compares the outgoing message sequence per protocol between two capture folders.
// Usage: bun compare.ts <baselineDir> <newDir>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [baselineDir, newDir] = process.argv.slice(2);

type Sent = {protocol: string; label: string; size: number | null};

const parse = (file: string): Map<string, Sent[]> => {
    const byProtocol = new Map<string, Sent[]>();

    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(/^#\d+ \S+ \S+ (->|<-) (\S+) (.*)$/);

        if (!match || match[1] !== '->') {
            continue;
        }

        const [, , protocol, rest] = match;

        if (rest.includes('/feedback') || /^200 OK/.test(rest)) {
            continue;
        }

        const size = rest.match(/\((\d+)B\)\s*$/);
        const label = rest
            .replace(/\(\d+B\)\s*$/, '')
            .replace(/cseq=\d+/, '')
            .replace(/x=\d+/, '')
            .replace(/\/\d{5,}/, '/<session>')
            .trim();

        const list = byProtocol.get(protocol) ?? [];
        list.push({protocol, label, size: size ? Number(size[1]) : null});
        byProtocol.set(protocol, list);
    }

    return byProtocol;
};

let failures = 0;

for (const name of readdirSync(baselineDir).filter(file => file.endsWith('.traffic.txt')).sort()) {
    const other = join(newDir, name);

    if (!existsSync(other)) {
        console.log(`MISSING  ${name}`);
        failures++;

        continue;
    }

    const before = parse(join(baselineDir, name));
    const after = parse(other);
    const problems: string[] = [];
    const notes: string[] = [];

    for (const protocol of new Set([...before.keys(), ...after.keys()])) {
        const a = before.get(protocol) ?? [];
        const b = after.get(protocol) ?? [];
        const length = Math.max(a.length, b.length);

        for (let index = 0; index < length; index++) {
            const left = a[index];
            const right = b[index];

            if (!left || !right || left.label !== right.label) {
                problems.push(`  ${protocol}[${index}] baseline: ${left?.label ?? '(none)'} | new: ${right?.label ?? '(none)'}`);

                continue;
            }

            if (left.size !== null && right.size !== null && left.size !== right.size) {
                const delta = right.size - left.size;

                (Math.abs(delta) > 4 ? problems : notes).push(`  ${protocol}[${index}] ${left.label}: ${left.size}B -> ${right.size}B (${delta > 0 ? '+' : ''}${delta})`);
            }
        }
    }

    const sent = [...after.values()].reduce((sum, list) => sum + list.length, 0);

    if (problems.length > 0) {
        failures++;
        console.log(`DIFF     ${name} (${sent} sent)`);
        console.log(problems.join('\n'));
    } else {
        console.log(`OK       ${name} (${sent} sent${notes.length > 0 ? `, ${notes.length} size deltas <= 4B` : ''})`);
    }
}

process.exit(failures > 0 ? 1 : 0);
