import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export function ArtworkVideo({url}: {readonly url: string}) {
    const video = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const element = video.current;
        if (!element) return;
        setError(null);
        let hls: Hls | undefined;

        // Electron can claim native HLS support without successfully loading the playlist.
        if (/\.m3u8(?:\?|$)/i.test(url) && Hls.isSupported()) {
            hls = new Hls({enableWorker: false, capLevelToPlayerSize: true});
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    setError(`Video playback failed: ${data.details}`);
                    hls?.destroy();
                }
            });
            hls.loadSource(url);
            hls.attachMedia(element);
        } else {
            element.src = url;
        }

        return () => {
            hls?.destroy();
            element.pause();
            element.removeAttribute('src');
            element.load();
        };
    }, [url]);

    return (
        <div className="space-y-2">
            <video ref={video} muted loop controls playsInline autoPlay
                aria-label="Animated album artwork" className="max-h-80 max-w-full rounded-lg border border-border"
                onError={() => {
                    const failure = video.current?.error;
                    setError(`Video playback failed (${failure?.code ?? 'unknown'}): ${failure?.message || 'No media error details available.'}`);
                }}/>
            {error && <p role="status" className="text-xs text-text-muted">{error}</p>}
        </div>
    );
}
