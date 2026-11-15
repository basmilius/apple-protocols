# URLs and audio streams

`AirPlaySession.playUrl()` and `AirPlaySession.streamAudio()` each open a connection of their own to the receiver, because the receiver wants them apart from remote control. Both end with the session they came from.

Both return a playback with the same shape for waiting: `ended: Promise<void>`.

## URL playback

```ts
import { connect } from '@corewire/airplay';

const session = await connect({address: '192.168.1.20'});

if (session.supportsUrlPlayback) {
    const playback = await session.playUrl('https://example.com/movie.mp4', {position: 0});

    console.log(await playback.getPlaybackInfo());
    await playback.ended;
}
```

`playUrl(url, options?)` resolves a `UrlPlayback` once playback started. It goes through the play queue when the receiver has one, and through `POST /play` otherwise. It throws `PlaybackError` when the receiver cannot play URLs or refuses this one.

| Member | Meaning |
| --- | --- |
| `getPlaybackInfo()` | `duration`, `position`, `rate`, `readyToPlay`, `error` and, in a play queue session, `state`. Empty when nothing plays, null when the receiver did not answer |
| `ended` | Resolves when playback ends, then closes the connection. Rejects with `PlaybackError` when the receiver reports an error |
| `stop()` | Stops playback and closes the connection |
| `signal` | Aborts when the connection closes |

`ended` is lazy. The first read starts to follow the play queue, or on a receiver without one, to poll `/playback-info`. A consumer that never reads it sends no polls.

A HomePod advertises no video feature and has `supportsUrlPlayback` false. Stream the audio to it instead.

## Audio streams

```ts
import { connect, TimingServer } from '@corewire/airplay';
import { SineWaveSource } from '@corewire/audio-source';

const timing = new TimingServer();
await timing.listen();

const session = await connect({address: '192.168.1.30'}, {timing});
const playback = await session.streamAudio(new SineWaveSource({duration: 5}), {volumeDb: -25});

await playback.ended;
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
| `ended` | Resolves once the source ran out and TEARDOWN went out; rejects when the stream failed or was stopped halfway |
| `stats` | `AudioStreamStats`: packets sent, retransmit requests and their outcome, loss rate, bytes sent |
| `stop()` | Stops the source and closes the connection, without TEARDOWN |
| `signal` | Aborts when the connection closes |

## Timing

A receiver synchronizes its clock with the sender while it plays audio. `TimingServer` answers its NTP requests on a UDP port; `listen()` binds it and `port` tells which. Pass it as the `timing` option of `connect()` and the session announces it in every SETUP. One server can serve every session in a process. `new TimingServer({logger})` sends the errors of its socket to a `Logger`.

NTP timestamps use the wall clock, so a server restart does not shift them.

`PtpMaster` is an IEEE 1588 grandmaster for receivers that advertise PTP support. It is experimental.

## Audio format

The constants `AUDIO_SAMPLE_RATE` (44100), `AUDIO_CHANNELS` (2) and `AUDIO_BYTES_PER_CHANNEL` (2) describe the PCM an `AudioSource` delivers.
