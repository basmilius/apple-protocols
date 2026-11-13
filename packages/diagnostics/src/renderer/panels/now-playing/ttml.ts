export type LyricSegment = {
    readonly text: string;
    readonly begin: number | null;
    readonly end: number | null;
    readonly wordTimed?: boolean;
};

export type LyricLine = LyricSegment & {
    readonly segments: readonly LyricSegment[];
};

export type TimedLyrics = {
    readonly language: string | null;
    readonly lines: readonly LyricLine[];
};

export function lyricTime(value: string | null): number | null {
    if (!value) return null;
    if (/^\d+(?:\.\d+)?(?:s)?$/.test(value)) return Number(value.replace(/s$/, ''));
    if (/^\d+(?:\.\d+)?ms$/.test(value)) return Number(value.slice(0, -2)) / 1000;
    const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
    if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function isLyricActive(segment: LyricSegment, elapsed: number): boolean {
    return segment.begin !== null && segment.end !== null && elapsed >= segment.begin && elapsed < segment.end;
}

/** Apple lyric timestamps are song positions, including spans nested in timed paragraphs. */
export function parseLyricsTTML(xml: string): TimedLyrics {
    if (xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
        throw new Error('Unsupported TTML document.');
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement;
    if (doc.getElementsByTagName('parsererror').length || root.localName !== 'tt' || root.namespaceURI !== 'http://www.w3.org/ns/ttml') {
        throw new Error('Invalid TTML document.');
    }
    const timing = Array.from(root.attributes).find(attribute => attribute.localName === 'timing')?.value;
    const allowWordTiming = timing?.toLowerCase() !== 'line';
    const body = root.getElementsByTagNameNS(root.namespaceURI, 'body')[0];
    const lines: LyricLine[] = [];
    for (const p of body?.getElementsByTagNameNS(root.namespaceURI, 'p') ?? []) {
        const begin = lyricTime(p.getAttribute('begin'));
        const end = lyricTime(p.getAttribute('end'));
        const segments: LyricSegment[] = [];
        function visit(node: Node, start: number | null, finish: number | null, wordTimed = false): void {
            if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
                const text = node.textContent?.replace(/[\t\r\n ]+/g, ' ') ?? '';
                if (text) segments.push({text, begin: start, end: finish, wordTimed});
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const element = node as Element;
            if (element.localName === 'br') {
                segments.push({text: '\n', begin: start, end: finish});
                return;
            }
            const explicitStart = lyricTime(element.getAttribute('begin'));
            const explicitEnd = lyricTime(element.getAttribute('end'));
            const ownStart = explicitStart ?? start;
            const ownFinish = explicitEnd ?? finish;
            // Inherited paragraph times are not word-level timing.
            const timedWord = wordTimed || (allowWordTiming && element.localName === 'span'
                && explicitStart !== null && explicitEnd !== null && explicitEnd > explicitStart);
            for (const child of element.childNodes) visit(child, ownStart, ownFinish, timedWord);
        }
        visit(p, begin, end);
        const text = segments.map(segment => segment.text).join('').trim();
        if (text) lines.push({text, begin, end, segments});
    }
    return {language: root.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang'), lines};
}
