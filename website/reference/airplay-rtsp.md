# @corewire/airplay/rtsp

```ts
import { buildResponse, parseRequest, parseResponse, RtspClient } from '@corewire/airplay/rtsp';
```

See [RTSP](/protocols/rtsp).

## RtspClient

`class RtspClient extends Connection<{}>`

| Member | Description |
| --- | --- |
| `constructor(context: Context, address: string, port: number)` | |
| `protected exchange(method: Method, path: string, options?: ExchangeOptions): Promise<Response>` | Sends a request with CSeq tracking and a timeout. Throws `TimeoutError`, and `InvalidResponseError` for a status that is not OK unless `allowError` |
| `protected getDefaultHeaders(): Record<string, string \| number>` | Headers for every request |
| `protected transformIncoming(data: Buffer): Buffer \| false \| {data: Buffer; consumed: number}` | Decrypts incoming data; `false` waits for more |
| `protected transformOutgoing(data: Buffer): Buffer` | Encrypts a formatted request |

It inherits `connect()`, `disconnect()`, `destroy()`, `write()` and the events of `Connection`.

## Functions

| Export | Description |
| --- | --- |
| `parseRequest(buffer: Buffer): RtspRequest \| null` | Null while the buffer is incomplete. Throws on a malformed request line |
| `parseResponse(buffer: Buffer): RtspResponse \| null` | Null while the buffer is incomplete. Throws on a malformed status line |
| `buildResponse(options: BuildResponseOptions): Buffer` | Formats a response; sets `Content-Length` |

## Types

| Type | Definition |
| --- | --- |
| `Method` | `'ANNOUNCE' \| 'FLUSH' \| 'FLUSHBUFFERED' \| 'GET' \| 'GET_PARAMETER' \| 'OPTIONS' \| 'POST' \| 'PUT' \| 'RECORD' \| 'SETUP' \| 'SET_PARAMETER' \| 'TEARDOWN'` |
| `RtspRequest` | `{headers: Record<string, string>; method: Method; path: string; body: Buffer; requestLength: number}` |
| `RtspResponse` | `{response: Response; responseLength: number}` |
| `BuildResponseOptions` | `{status: number; statusText: string; headers?: Record<string, string \| number>; body?: Buffer; protocol?: 'RTSP/1.0' \| 'HTTP/1.1'}` |
| `ExchangeOptions` | `{contentType?: string; headers?: Record<string, string>; body?: Buffer \| string \| Record<string, unknown>; allowError?: boolean; protocol?: 'RTSP/1.0' \| 'HTTP/1.1'; timeout?: number}` |

Header names in an `RtspRequest` are normalized: `content-length` becomes `Content-Length`, and `cseq` becomes `CSeq`.
