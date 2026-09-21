import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { ArrowDown, Maximize2, Minimize2 } from 'lucide-react';
import { isLyricActive, parseLyricsTTML, type LyricLine, type LyricSegment } from './ttml';

type LyricsViewProps = {
    readonly text: string;
    readonly elapsed: number;
    readonly title?: string;
    readonly artist?: string;
    readonly artworkUrl?: string | null;
};

function wordStyle(segment: LyricSegment, elapsed: number): CSSProperties | undefined {
    if (segment.begin === null || segment.end === null || segment.end <= segment.begin) return undefined;
    const progress = Math.max(0, Math.min(1, (elapsed - segment.begin) / (segment.end - segment.begin)));
    return {
        backgroundImage: 'linear-gradient(90deg, #fff 0%, #fff 48%, rgb(255 255 255 / .55) 52%, rgb(255 255 255 / .55) 100%)',
        backgroundSize: '208% 100%',
        backgroundPosition: `${100 - progress * 100}% 0`
    };
}

export function LyricsView({text, elapsed, title, artist, artworkUrl}: LyricsViewProps) {
    const container = useRef<HTMLDivElement>(null);
    const previous = useRef({index: -1, text: ''});
    const [follow, setFollow] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const parsed = useMemo(() => {
        if (!text.trimStart().startsWith('<')) {
            const lines: LyricLine[] = text.split(/\r?\n/).filter(line => line.trim()).map(line => ({text: line, begin: null, end: null, segments: [{text: line, begin: null, end: null}]}));
            return {lyrics: {lines, language: null}, error: null};
        }
        try {
            return {lyrics: parseLyricsTTML(text), error: null};
        } catch (error) {
            return {lyrics: null, error: error instanceof Error ? error.message : 'Invalid TTML.'};
        }
    }, [text]);
    const lines = parsed.lyrics?.lines ?? [];
    const timed = lines.some(line => line.begin !== null && line.end !== null);
    const activeIndex = lines.findIndex(line => isLyricActive(line, elapsed));
    const focusIndex = activeIndex >= 0 ? activeIndex : Math.max(0, lines.findLastIndex(line => line.begin !== null && line.begin <= elapsed));

    useLayoutEffect(() => {
        const parent = container.current;
        if (!parent || !follow || !timed) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const adjacent = previous.current.text === text && Math.abs(previous.current.index - focusIndex) <= 2;
        const scroll = (smooth: boolean): void => {
            const line = parent.querySelector<HTMLElement>(`[data-line="${focusIndex}"]`);
            if (!line) return;
            parent.scrollTo({top: line.offsetTop - parent.clientHeight * .32, behavior: smooth && !reducedMotion ? 'smooth' : 'instant'});
        };
        scroll(adjacent);
        previous.current = {index: focusIndex, text};
        let initialResize = true;
        const resize = new ResizeObserver(() => {
            if (initialResize) { initialResize = false; return; }
            scroll(false);
        });
        resize.observe(parent);
        return () => resize.disconnect();
    }, [focusIndex, follow, text, timed, expanded]);

    if (!parsed.lyrics) return <p className="text-xs text-status-error">{parsed.error}</p>;
    return (
        <section aria-label="Lyrics preview" className="@container relative isolate overflow-hidden rounded-2xl bg-lyrics-background text-lyrics-foreground shadow-lg ring-1 ring-lyrics-shadow/10">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                {artworkUrl && <img src={artworkUrl} alt="" className="h-full w-full scale-125 object-cover opacity-50 blur-3xl"/>}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(185,116,95,.35),transparent_70%)]"/>
                <div className="absolute inset-0 bg-gradient-to-b from-lyrics-shadow/10 to-lyrics-shadow/50"/>
            </div>
            <header className="flex items-center gap-3 px-6 pt-6 pb-2">
                {artworkUrl && <img src={artworkUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-lyrics-foreground/10"/>}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-lyrics-foreground">{title || 'Lyrics'}</p>
                    <p className="truncate text-xs text-lyrics-foreground/55">{artist || (timed ? 'Synced to playback' : 'Song lyrics')}</p>
                </div>
                <button type="button" aria-label={expanded ? 'Collapse lyrics' : 'Expand lyrics'} aria-pressed={expanded} onClick={() => setExpanded(value => !value)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lyrics-foreground/60 transition-colors hover:bg-lyrics-foreground/10 hover:text-lyrics-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lyrics-foreground">
                    {expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                </button>
            </header>
            <div className="relative">
                <div ref={container} tabIndex={0} aria-label="Song lyrics; scroll to browse" lang={parsed.lyrics.language ?? undefined}
                    onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)} onPointerDown={() => setFollow(false)}
                    onKeyDown={event => {if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) setFollow(false);}}
                    className={clsx('relative overflow-y-auto overscroll-contain px-6 [scrollbar-width:none] [-webkit-mask-image:linear-gradient(transparent,black_12%,black_80%,transparent)] [mask-image:linear-gradient(transparent,black_12%,black_80%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lyrics-foreground/50', expanded ? 'h-[min(65vh,680px)]' : 'h-[420px]')}>
                    <div className={clsx('space-y-7 pb-[300px] pt-28', expanded && 'pb-[450px]')}>
                        {lines.map((line, index) => {
                            const active = isLyricActive(line, elapsed);
                            const distance = Math.abs(index - focusIndex);
                            const wordTimed = line.segments.some(segment => segment.wordTimed);
                            return (
                                <p key={index} data-line={index} data-active={active} className={clsx(
                                    'origin-left whitespace-pre-wrap break-words text-[clamp(24px,6cqw,40px)] leading-[1.22] font-bold tracking-[-.035em] duration-500 ease-out motion-reduce:scale-100 motion-reduce:transition-none',
                                    wordTimed ? 'transition-[opacity,scale,filter]' : 'transition-[scale,filter]',
                                    !timed || !follow || active ? 'scale-100 opacity-100 blur-none' : distance > 2 ? 'scale-[.96] opacity-25 blur-[.6px] motion-reduce:blur-none' : 'scale-[.97] opacity-45 blur-none'
                                )}>
                                    {line.segments.map((segment, part) => (
                                        <span key={part} style={timed && follow && segment.wordTimed ? wordStyle(segment, elapsed) : undefined} className={clsx(
                                            timed && follow && segment.wordTimed && segment.begin !== null && segment.end !== null && segment.end > segment.begin && 'bg-clip-text text-transparent [-webkit-box-decoration-break:slice] [box-decoration-break:slice] transition-[background-position] duration-100 ease-linear motion-reduce:transition-none'
                                        )}>{segment.text}</span>
                                    ))}
                                </p>
                            );
                        })}
                        {lines.length === 0 && <p className="text-sm text-lyrics-foreground/60">No lyrics available.</p>}
                    </div>
                </div>
                {timed && !follow && <button type="button" onClick={() => setFollow(true)} className="absolute bottom-5 left-1/2 flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-lyrics-foreground px-4 text-xs font-semibold text-lyrics-shadow shadow-lg transition-transform active:scale-[.96] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lyrics-foreground"><ArrowDown size={14}/>Follow playback</button>}
                {timed && follow && <p className="pointer-events-none absolute right-6 bottom-6 text-[10px] font-medium tracking-[.16em] text-lyrics-foreground/40 uppercase">Live lyrics</p>}
            </div>
        </section>
    );
}
