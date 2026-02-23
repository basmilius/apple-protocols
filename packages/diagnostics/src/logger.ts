import { stripANSI } from 'bun';
import { createWriteStream, type WriteStream } from 'node:fs';
import { format } from 'node:util';

const USE_DATE_LOGS = false;

let stdoutLog: WriteStream;
let stderrLog: WriteStream;

export function startSavingLogs(): void {
    if (USE_DATE_LOGS) {
        const datetime = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
        stdoutLog = createWriteStream(`output-${datetime}.log`);
        stderrLog = createWriteStream(`error-${datetime}.log`);
    } else {
        stdoutLog = createWriteStream(`output.log`);
        stderrLog = createWriteStream(`error.log`);
    }

    const originalLog = console.log.bind(console);
    const originalDebug = console.debug.bind(console);
    const originalInfo = console.info.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    const writeToStdout = (...args: any[]) => {
        stdoutLog.write(stripANSI(format(...args)) + '\n');
    };

    const writeToStderr = (...args: any[]) => {
        stderrLog.write(stripANSI(format(...args)) + '\n');
    };

    console.log = (...args: any[]) => {
        writeToStdout(...args);
        originalLog(...args);
    };

    console.debug = (...args: any[]) => {
        writeToStdout(...args);
        originalDebug(...args);
    };

    console.info = (...args: any[]) => {
        writeToStdout(...args);
        originalInfo(...args);
    };

    console.warn = (...args: any[]) => {
        writeToStderr(...args);
        originalWarn(...args);
    };

    console.error = (...args: any[]) => {
        writeToStderr(...args);
        originalError(...args);
    };
}

export function stopSavingLogs(): void {
    stdoutLog?.close();
    stderrLog?.close();
}
