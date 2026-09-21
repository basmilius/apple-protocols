/// <reference types="vite/client" />

import type { DiagnosticsBridge } from '@shared/contract';

declare global {
    interface Window {
        readonly diagnostics: DiagnosticsBridge;
    }
}

export {};
