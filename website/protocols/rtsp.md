# RTSP

```ts
import { buildResponse, parseRequest, parseResponse, RtspClient } from '@corewire/airplay/rtsp';
```

AirPlay control and RAOP both speak RTSP. This entry point holds the client they build on and the parsers.

## RtspClient

`RtspClient` is a `Connection` that sends requests with CSeq tracking and a response timeout, and serializes object bodies as binary plists. Its `exchange()` method is protected, so you extend the class and give it the requests your protocol needs.

```ts
import { RtspClient } from '@corewire/airplay/rtsp';
import { Context } from '@corewire/core/transport';

class InfoClient extends RtspClient {
    async info(): Promise<Response> {
        return await this.exchange('GET', '/info', {allowError: true});
    }
}

const client = new InfoClient(new Context('Living-Room.local'), '192.168.1.20', 7000);
await client.connect();

const response = await client.info();
console.log(response.status, response.headers.get('content-type'));

await client.disconnect();
```

`exchange(method, path, options?)` resolves a web `Response`. It rejects with `TimeoutError` when no response arrives in time, and with `InvalidResponseError` for a status that is not OK unless you set `allowError`.

| Option | Meaning |
| --- | --- |
| `body` | A `Buffer`, a string, or an object that becomes a binary plist |
| `contentType` | Set automatically for object bodies |
| `headers` | Extra headers |
| `allowError` | Resolve instead of reject on a status that is not OK |
| `protocol` | `RTSP/1.0` (default) or `HTTP/1.1` |
| `timeout` | Milliseconds; 6000 by default |

Three more protected methods are the extension points: `getDefaultHeaders()` adds headers to every request, `transformOutgoing()` encrypts a formatted request, and `transformIncoming()` decrypts incoming data. The client keeps ciphertext and plaintext in separate buffers, so a partial TCP delivery never mixes them.

## Parsing

`parseRequest(buffer)` and `parseResponse(buffer)` parse one message from the start of a buffer. They return null while the buffer is incomplete, so you can call them as TCP data arrives. The result says how many bytes it used (`requestLength`, `responseLength`). `buildResponse(options)` formats a response with `Content-Length` set.

```ts
import { buildResponse, parseRequest } from '@corewire/airplay/rtsp';

declare function write(data: Buffer): void;

let buffer = Buffer.alloc(0);

function onData(data: Buffer): void {
    buffer = Buffer.concat([buffer, data]);

    let request = parseRequest(buffer);

    while (request) {
        buffer = buffer.subarray(request.requestLength);
        write(buildResponse({status: 200, statusText: 'OK', headers: {CSeq: request.headers.CSeq}}));
        request = parseRequest(buffer);
    }
}
```
