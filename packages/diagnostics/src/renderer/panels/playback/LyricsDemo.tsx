import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { LyricsView } from './LyricsView';

const DEMO_LINES = [
    'The city settles into blue',
    'A window catches passing light',
    'We take the long way home again',
    'And leave the quiet streets behind',
    'There is a little room to breathe',
    'Between the evening and the dawn'
];
const DEMO_TTML = `<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en"><body>${DEMO_LINES.map((line, index) => {
    const start = index * 5 + 1;
    const words = line.split(' ');
    return `<p begin="${start}" end="${start + 4}">${words.map((word, part) => `<span begin="${start + part * 4 / words.length}" end="${start + (part + 1) * 4 / words.length}">${word}</span>`).join(' ')}</p>`;
}).join('')}</body></tt>`;

export function LyricsDemo() {
    const [elapsed, setElapsed] = useState(1);
    const [playing, setPlaying] = useState(true);
    const [restart, setRestart] = useState(0);
    useEffect(() => {
        if (!playing) return;
        const start = performance.now();
        const position = elapsed;
        const timer = window.setInterval(() => setElapsed((position + (performance.now() - start) / 1000) % 32), 100);
        return () => window.clearInterval(timer);
        // Capture the current position when playback resumes, not on every clock tick.
    }, [playing, restart]);
    return (
        <div className="space-y-3">
            <LyricsView text={DEMO_TTML} elapsed={elapsed} title="The long way home" artist="Preview · original sample lyrics"/>
            <div className="flex items-center gap-3 text-xs text-text-muted">
                <button type="button" aria-label={playing ? 'Pause demo' : 'Play demo'} onClick={() => setPlaying(value => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
                <button type="button" aria-label="Restart demo" onClick={() => {setElapsed(1); setRestart(value => value + 1);}} className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"><RotateCcw size={15}/></button>
                <span>Demo · no Apple Music session needed</span>
            </div>
        </div>
    );
}
