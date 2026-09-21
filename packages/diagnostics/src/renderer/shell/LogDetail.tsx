import { useMemo } from 'react';
import clsx from 'clsx';
import { Copy, X } from 'lucide-react';
import type { DebugGroup, LogEntry } from '@shared/contract';
import { formatTime, isBytes } from '@shared/helpers';
import { BTN_GROUP, IconButton, JsonView, KeyValue, KeyValueList, SECTION_LABEL } from '@/ui';

/** How many bytes a dump puts on one line, which is what every hex viewer prints. */
const DUMP_WIDTH = 16;

const PRINTABLE = /[ -~]/;

type DumpLine = {
    readonly offset: string;
    readonly hex: string;
    readonly ascii: string;
};

/* The classic three columns: the offset, the bytes, and what those bytes are as text. */
const dumpOf = (hex: string): DumpLine[] => {
    const bytes = hex.match(/.{1,2}/g) ?? [];
    const lines: DumpLine[] = [];

    for (let start = 0; start < bytes.length; start += DUMP_WIDTH) {
        const run = bytes.slice(start, start + DUMP_WIDTH);

        lines.push({
            offset: start.toString(16).padStart(8, '0'),
            hex: run.join(' ').padEnd(DUMP_WIDTH * 3 - 1, ' '),
            ascii: run
                .map(byte => String.fromCharCode(Number.parseInt(byte, 16)))
                .map(character => (PRINTABLE.test(character) ? character : '.'))
                .join('')
        });
    }

    return lines;
};

function HexDump({hex, length}: { readonly hex: string; readonly length: number }) {
    const lines = useMemo(() => dumpOf(hex), [hex]);

    return (
        <div className="flex flex-col gap-1">
            <span className={SECTION_LABEL}>{length} bytes</span>
            <div className="mono overflow-auto rounded-md bg-code-bg p-2 whitespace-pre text-code-fg">
                {lines.map(line => (
                    <div key={line.offset}>
                        <span className="text-code-dim">{line.offset}</span> {line.hex} <span className="text-code-dim">{line.ascii}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** A message main already rendered to one line, parsed back into a tree when it is one. */
const treeOf = (message: string): unknown => {
    const trimmed = message.trim();
    const start = trimmed.search(/[[{]/);

    if (start === -1) {
        return null;
    }

    try {
        return JSON.parse(trimmed.slice(start));
    } catch {
        return null;
    }
};

const copy = (text: string): void => {
    void navigator.clipboard.writeText(text);
};

/*
 * One log line, unpacked: the stamp it carries, where it came from, the whole message, and every
 * argument the protocol package passed along. A row in the list is one truncated line, so this is
 * the only place a payload can be read.
 */
export function LogDetail({entry, deviceName, groupColor, onClose, className}: {
    readonly entry: LogEntry;
    readonly deviceName: string | null;
    readonly groupColor: Record<DebugGroup, string>;
    readonly onClose: () => void;
    readonly className?: string;
}) {
    const fallback = useMemo(() => (entry.args.length > 0 ? null : treeOf(entry.message)), [entry]);

    return (
        <div className={clsx('flex min-h-0 min-w-0 flex-col bg-surface', className)}>
            <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-3">
                <h2 className={clsx(SECTION_LABEL, 'uppercase tracking-wide')}>Entry</h2>
                <span className={clsx('mono inline-flex h-5 items-center rounded-md bg-surface-active px-1.5', groupColor[entry.group])}>{entry.group}</span>
                <span className={clsx(BTN_GROUP, 'ml-auto')}>
                    <IconButton icon={Copy} label="Copy the message" size="sm" onClick={() => copy(entry.message)}/>
                    <IconButton icon={X} label="Close the entry" size="sm" onClick={onClose}/>
                </span>
            </header>
            <div className="flex min-h-0 grow flex-col gap-4 overflow-auto p-3">
                <KeyValueList>
                    <KeyValue label="Time">{formatTime(entry.timestamp)}</KeyValue>
                    <KeyValue label="Timestamp">{new Date(entry.timestamp).toISOString()}</KeyValue>
                    <KeyValue label="Device" mono={false}>
                        {deviceName ?? entry.deviceId ?? 'The application'}
                    </KeyValue>
                </KeyValueList>

                <div className="flex flex-col gap-1">
                    <span className={SECTION_LABEL}>Message</span>
                    <pre className="mono rounded-md bg-code-bg p-2 break-all whitespace-pre-wrap text-code-fg">{entry.message}</pre>
                </div>

                {entry.args.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className={SECTION_LABEL}>Arguments</span>
                            <span className="ml-auto">
                                <IconButton icon={Copy} label="Copy the arguments as JSON" size="sm" onClick={() => copy(JSON.stringify(entry.args, null, 4))}/>
                            </span>
                        </div>
                        {entry.args.map((argument, index) => (
                            <div key={index} className="rounded-md bg-code-bg p-2">
                                {isBytes(argument) ? <HexDump hex={argument.$bytes} length={argument.length}/> : <JsonView value={argument} defaultDepth={3}/>}
                            </div>
                        ))}
                    </div>
                )}

                {fallback !== null && (
                    <div className="flex flex-col gap-1">
                        <span className={SECTION_LABEL}>Parsed</span>
                        <div className="rounded-md bg-code-bg p-2">
                            <JsonView value={fallback} defaultDepth={3}/>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
