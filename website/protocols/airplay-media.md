# URLs and audio streams

`AirPlaySession.playUrl()` and `AirPlaySession.streamAudio()` each open a connection of their own to the receiver, because the receiver wants them apart from remote control. Both end with the session they came from.

## URL playback

```ts
import { connect } from '@corewire/airplay';

const session = await connect({address: '192.168.1.20'});

if (session.supportsUrlPlayback) {
    const playback = await session.playUrl('https://example.com/movie.mp4', {position: 0});

    console.log(await playback.getPlaybackInfo());
    await playback.waitForEnd();
}
```

`playUrl(url, options?)` resolves a `UrlPlayback` once playback started. It goes through the play queue when the receiver has one, and through `POST /play` otherwise. It throws `PlaybackError` when the receiver cannot play URLs or refuses this one.

| Member | Meaning |
| --- | --- |
| `getPlaybackInfo()` | `duration`, `position`, `rate`, `readyToPlay`, `error` and, in a play queue session, `state`. Empty when nothing plays, null when the receiver did not answer |
| `waitForEnd()` | Resolves when playback ends, then closes the connection. Rejects with `PlaybackError` when the receiver reports an error |
| `stop()` | Stops playback and closes the connection |
| `signal` | Aborts when the connection closes |

A HomePod advertises no video feature and has `supportsUrlPlayback` false. Stream the audio to it instead.

## Audio streams

```ts
import { connect, TimingServer } from '@corewire/airplay';
import { SineWave } from '@corewire/audio-source';

const timing = new TimingServer();
await timing.listen();

const session = await connect({address: '192.168.1.30'}, {timing});
const playback = await session.streamAudio(new SineWave(5), {volumeDb: -25});

await playback.finished;
await session.close();
timing.close();
```

`streamAudio(source, options?)` resolves an `AudioPlayback` once the stream is set up. It streams encrypted RTP over UDP with RTCP sync and retransmission of lost packets. The source is stopped in every case.

| Option | Meaning |
| --- | --- |
| `volumeDb` | Stream volume, -144 (silent) to 0. A fresh audio session starts silent, so -20 when omitted |
| `ptpMaster` | Experimental. A `PtpMaster` for receivers that support PTP; production streams leave this out |
| `signal` | Cancels the setup or ends the stream |

| Member | Meaning |
| --- | --- |
| `finished` | Resolves once the source ran out and TEARDOWN went out; rejects when the stream failed or was stopped halfway |
| `stats` | `AudioStreamStats`: packets sent, retransmit requests and their outcome, loss rate, bytes sent |
| `stop()` | Stops the source and closes the connection, without TEARDOWN |
| `signal` | Aborts when the connection closes |

## Timing

A receiver synchronizes its clock with the sender while it plays audio. `TimingServer` answers its NTP requests on a UDP port; `listen()` binds it and `port` tells which. Pass it as the `timing` option of `connect()` and the session announces it in every SETUP. One server can serve every session in a process.

NTP timestamps use the wall clock, so a server restart does not shift them.

`PtpMaster` is an IEEE 1588 grandmaster for receivers that advertise PTP support. It is experimental. `selectTimingStrategy(features)` returns `PTP`, `NTP` or `None` for a feature mask.

## Several receivers

`AudioMultiplexer` streams one source to several receivers with shared timing. Each target gets its own audio connection with its own encryption and RTP state.

```ts
import { AudioMultiplexer, connect, TimingServer } from '@corewire/airplay';
import { File } from '@corewire/audio-source';

const timing = new TimingServer();
await timing.listen();

const kitchen = await connect({address: '192.168.1.30'}, {timing});
const living = await connect({address: '192.168.1.31'}, {timing});

const multiplexer = new AudioMultiplexer(kitchen.context);
multiplexer.addTarget(kitchen, {volumeDb: -20});
multiplexer.addTarget(living, {volumeDb: -20});

await multiplexer.stream(await File.fromPath('song.mp3'));
```

Any failure closes every stream.

## Building blocks

`AudioStream` runs one RTP stream on an audio session: `setup()`, `prepare()`, `sendFrameData()` and `finish()`, or `stream()` for all of it. `LatencyManager` adapts latency and redundancy to glitches. `AudioSourceSession` owns one use of a source and settles readers when it stops. The constants `AUDIO_SAMPLE_RATE` (44100), `AUDIO_CHANNELS` (2), `AUDIO_BYTES_PER_CHANNEL` (2) and `AUDIO_FRAMES_PER_PACKET` (352) describe the format.
