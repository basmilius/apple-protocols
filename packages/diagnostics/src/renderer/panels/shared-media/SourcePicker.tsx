import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { AUDIO_SOURCE_KINDS, type AudioSourceKind, type AudioSourceSpec } from '@shared/contract';
import { invoke } from '@/client';
import { Button, Field, Icon, Segmented, Select, TextInput } from '@/ui';

const KIND_LABELS: Record<AudioSourceKind, string> = {
    url: 'Url',
    file: 'File',
    wav: 'Wav',
    mp3: 'Mp3',
    ogg: 'Ogg',
    pcm: 'Pcm',
    sineWave: 'SineWave',
    ffmpeg: 'Ffmpeg',
    live: 'Live'
};

const KIND_HINTS: Record<AudioSourceKind, string> = {
    url: 'Downloads the whole file, then streams it as PCM.',
    file: 'Reads a local file and decodes it by extension.',
    wav: 'Decodes WAV, from a URL or from disk.',
    mp3: 'Decodes MP3, from a URL or from disk.',
    ogg: 'Decodes Ogg Vorbis, from a URL or from disk.',
    pcm: 'Raw signed 16-bit little-endian stereo samples.',
    sineWave: 'Generated tone, useful to check whether anything is audible at all.',
    ffmpeg: 'Runs ffmpeg over the file and reads PCM off its stdout.',
    live: 'Ring buffer fed a generated tone, which exercises the live path.'
};

/** Decoders that read either a URL or a local file. */
const DUAL_ORIGIN: readonly AudioSourceKind[] = ['wav', 'mp3', 'ogg'];

type SourcePickerProps = {
    readonly value: AudioSourceSpec;
    readonly onValueChange: (value: AudioSourceSpec) => void;
    readonly disabled?: boolean;
};

export const DEFAULT_SOURCE: AudioSourceSpec = {kind: 'sineWave', frequency: 440, duration: 5};

export function SourcePicker({value, onValueChange, disabled}: SourcePickerProps) {
    const [picking, setPicking] = useState(false);

    const pick = async (): Promise<void> => {
        setPicking(true);

        try {
            const path = await invoke('audio:pickFile', {kind: value.kind});

            if (path !== null) {
                onValueChange({...value, path} as AudioSourceSpec);
            }
        } finally {
            setPicking(false);
        }
    };

    const change = (patch: Record<string, unknown>): void => {
        onValueChange({...value, ...patch} as AudioSourceSpec);
    };

    const origin = 'from' in value ? value.from : null;
    const wantsPath = value.kind === 'file' || value.kind === 'pcm' || value.kind === 'ffmpeg' || origin === 'file';
    const wantsUrl = value.kind === 'url' || origin === 'url';

    return (
        <div className="flex flex-col gap-3">
            <Field label="Source type" hint={KIND_HINTS[value.kind]}>
                <Select<AudioSourceKind>
                    label="Source type"
                    value={value.kind}
                    disabled={disabled}
                    onValueChange={kind => onValueChange(defaultsFor(kind))}
                    items={AUDIO_SOURCE_KINDS.map(kind => ({value: kind, label: KIND_LABELS[kind], description: KIND_HINTS[kind]}))}
                />
            </Field>

            {DUAL_ORIGIN.includes(value.kind) && (
                <Field label="Origin">
                    <Segmented<'url' | 'file'> label="Origin" value={origin ?? 'url'} onValueChange={from => change({from})} items={[{value: 'url', label: 'From URL'}, {value: 'file', label: 'From file'}]}/>
                </Field>
            )}

            {wantsUrl && (
                <Field label="URL">
                    <TextInput label="URL" placeholder="https://example.com/audio.wav" value={('url' in value ? value.url : '') ?? ''} disabled={disabled} onChange={event => change({url: event.target.value})} mono/>
                </Field>
            )}

            {wantsPath && (
                <Field label="Path">
                    <div className="flex min-w-0 items-center gap-2">
                        <TextInput label="Path" placeholder="/path/to/audio" value={('path' in value ? value.path : '') ?? ''} disabled={disabled} onChange={event => change({path: event.target.value})} mono className="min-w-0 grow"/>
                        <Button variant="secondary" size="sm" disabled={disabled || picking} onClick={() => void pick()}>
                            <Icon icon={FolderOpen} size={14}/>
                            Browse
                        </Button>
                    </div>
                </Field>
            )}

            {value.kind === 'pcm' && (
                <Field label="Sample rate (Hz)">
                    <TextInput label="Sample rate" type="number" value={value.sampleRate ?? 44100} disabled={disabled} onChange={event => change({sampleRate: Number(event.target.value)})} mono/>
                </Field>
            )}

            {(value.kind === 'sineWave' || value.kind === 'live') && (
                <div className="flex flex-wrap gap-2">
                    <Field label="Frequency (Hz)" className="min-w-28 grow">
                        <TextInput label="Frequency (Hz)" type="number" value={value.frequency} disabled={disabled} onChange={event => change({frequency: Number(event.target.value)})} mono/>
                    </Field>
                    <Field label="Duration (s)" className="min-w-28 grow">
                        <TextInput label="Duration (s)" type="number" value={value.duration} disabled={disabled} onChange={event => change({duration: Number(event.target.value)})} mono/>
                    </Field>
                </div>
            )}

            {value.kind === 'live' && (
                <Field label="Ring buffer (s)">
                    <TextInput label="Ring buffer (s)" type="number" value={value.bufferDuration ?? 2} disabled={disabled} onChange={event => change({bufferDuration: Number(event.target.value)})} mono/>
                </Field>
            )}

            {value.kind === 'ffmpeg' && (
                <Field label="Duration (s)">
                    <TextInput label="Duration (s)" type="number" value={value.duration} disabled={disabled} onChange={event => change({duration: Number(event.target.value)})} mono/>
                </Field>
            )}
        </div>
    );
}

function defaultsFor(kind: AudioSourceKind): AudioSourceSpec {
    switch (kind) {
        case 'url':
            return {kind, url: ''};

        case 'file':
            return {kind, path: ''};

        case 'wav':
        case 'mp3':
        case 'ogg':
            return {kind, from: 'url', url: ''};

        case 'pcm':
            return {kind, path: '', sampleRate: 44100};

        case 'sineWave':
            return {kind, frequency: 440, duration: 5};

        case 'ffmpeg':
            return {kind, path: '', duration: 30};

        case 'live':
            return {kind, frequency: 440, duration: 10, bufferDuration: 2};
    }
}
