# Kibelt API documentation
methods, acceptable values, headers, responses and everything else related to making and parsing requests from a Kibelt API instance.

> [!NOTE]
> the public Kibelt API at **https://dl.kibe.lol/** is open to everyone — no keys, no captchas, no sign-up. you're welcome to use it directly, or [host your own instance](/docs/run-an-instance.md).

- [keyless shortcuts](#keyless-shortcuts)
- [POST /](#post)
- [POST /session](#post-session)
- [GET /](#get)
- [GET /tunnel](#get-tunnel)

all endpoints (except for `GET /`) are rate limited and return current rate limiting status in `RateLimit-*` headers, according to the ["RateLimit Header Fields for HTTP" spec](https://www.ietf.org/archive/id/draft-polli-ratelimit-headers-02.html#name-header-specifications).

## keyless shortcuts
for quick, no-frills use you can pass a link straight in the URL — no body, no headers, no auth:

| request                                  | behavior                                                                          |
|:-----------------------------------------|:----------------------------------------------------------------------------------|
| `GET https://dl.kibe.lol/<link>`         | resolves the link and returns the same JSON as `POST /` (a download url + metadata) |
| `GET https://dl.kibe.lol/download/<link>`| resolves the link and **302-redirects** straight to the file                      |
| `GET https://kibe.lol/<link>`            | convenience alias that redirects to `download/<link>` — i.e. just downloads        |

`<link>` may be raw or percent-encoded, for example:
```
https://dl.kibe.lol/https://x.com/i/status/123456
https://kibe.lol/https://soundcloud.com/artist/track
```

these shortcuts use sane defaults (auto video+audio, 1080p). for full control over
options, use [`POST /`](#post) below.

## authentication
an api instance may be configured to require you to authenticate yourself.
if this is the case, you will typically receive an [error response](#error-response)
with a **`api.auth.<method>.missing`** code, which tells you that a particular method
of authentication is required.

authentication is done by passing the `Authorization` header, containing
the authentication scheme and the token:
```
Authorization: <scheme> <token>
```

currently, Kibelt supports API key authentication. an instance can
choose to configure both, or neither:
- [`Api-Key`](#api-key-authentication)
- [`Bearer`](#bearer-authentication)

### api-key authentication
the api key authentication is the most straightforward. the instance owner
will assign you an api key which you can then use to authenticate like so:
```
Authorization: Api-Key aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

if you are an instance owner and wish to configure api key authentication,
see the [protect-an-instance](protect-an-instance.md#api-key-file-format) documentation!

### bearer authentication
the Kibelt server may be configured to issue JWT bearers — short-lived tokens
intended for regular users after passing a Cloudflare Turnstile challenge (only
if the instance has Turnstile configured). the public instance does not require
this. the resulting token is passed like so:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## POST `/`
Kibelt's main processing endpoint.

> [!IMPORTANT]
> you must include correct `Accept` and `Content-Type` headers with every `POST /` request.

```
Accept: application/json
Content-Type: application/json
```

### request body
body type: `application/json`

not a fan of reading tables of text?
you can read [the api schema](/api/src/processing/schema.js) directly from code instead!

### api schema
all keys except for `url` are optional. value options are separated by `/`.

#### general
| key               | type      | description/value                                               | default    |
|:------------------|:----------|:----------------------------------------------------------------|:-----------|
| `url`             | `string`  | source URL                                                      | *required* |
| `audioBitrate`    | `string`  | `320 / 256 / 128 / 96 / 64 / 8` (kbps)                          | `128`      |
| `audioFormat`     | `string`  | `best / mp3 / ogg / wav / opus`                                 | `mp3`      |
| `downloadMode`    | `string`  | `auto / audio / mute`                                           | `auto`     |
| `filenameStyle`   | `string`  | `classic / pretty / basic / nerdy`                              | `basic`    |
| `videoQuality`    | `string`  | `max / 4320 / 2160 / 1440 / 1080 / 720 / 480 / 360 / 240 / 144` | `1080`     |
| `disableMetadata` | `boolean` | title, artist, and other info will not be added to the file     | `false`    |
| `alwaysProxy`     | `boolean` | always tunnel all files, even when not necessary                | `false`    |
| `localProcessing` | `string`  | `disabled / preferred / forced`                                 | `disabled` |
| `subtitleLang`    | `string`  | any valid ISO 639-1 language code                               | *none*     |

#### service-specific options
| key                     | type      | description/value                                 | default |
|:------------------------|:----------|:--------------------------------------------------|:--------|
| `youtubeVideoCodec`     | `string`  | `h264 / av1 / vp9`                                | `h264`  |
| `youtubeVideoContainer` | `string`  | `auto / mp4 / webm / mkv`                         | `auto`  |
| `youtubeDubLang`        | `string`  | any valid ISO 639-1 language code                 | *none*  |
| `convertGif`            | `boolean` | convert twitter gifs to the actual GIF format     | `true`  |
| `allowH265`             | `boolean` | allow H265/HEVC videos from tiktok                | `false` |
| `tiktokFullAudio`       | `boolean` | download the original sound used in a video       | `false` |
| `youtubeBetterAudio`    | `boolean` | prefer higher quality youtube audio if possible   | `false` |
| `youtubeHLS`            | `boolean` | use HLS formats when downloading from youtube     | `false` |

### response
body type: `application/json`

the response will always be a JSON object containing the `status` key, which is one of:
- `tunnel`: Kibelt is proxying and/or remuxing/transcoding the file for you.
- `local-processing`: Kibelt is proxying the files for you, but you have to remux/transcode them locally.
- `redirect`: Kibelt will redirect you to the direct service URL.
- `picker`: there are multiple items to choose from, a picker should be shown.
- `error`: something went wrong, here's an error code.

### tunnel/redirect response
| key          | type     | value                                                      |
|:-------------|:---------|:-----------------------------------------------------------|
| `status`     | `string` | `tunnel / redirect`                                        |
| `url`        | `string` | url for the Kibelt tunnel, or redirect to an external link |
| `filename`   | `string` | Kibelt-generated filename for the file being downloaded    |

### local processing response
| key          | type       | value                                                         |
|:-------------|:-----------|:--------------------------------------------------------------|
| `status`     | `string`   | `local-processing`                                            |
| `type`       | `string`   | `merge`, `mute`, `audio`, `gif`, or `remux`                   |
| `service`    | `string`   | origin service (`youtube`, `twitter`, `instagram`, etc)       |
| `tunnel`     | `string[]` | array of tunnel URLs                                          |
| `output`     | `object`   | details about the output file ([see below](#output-object))   |
| `audio`      | `object`   | audio-specific details (optional, [see below](#audio-object)) |
| `isHLS`      | `boolean`  | whether the output is in HLS format (optional)                |

#### output object
| key         | type      | value                                                                             |
|:------------|:----------|:----------------------------------------------------------------------------------|
| `type`      | `string`  | mime type of the output file                                                      |
| `filename`  | `string`  | filename of the output file                                                       |
| `metadata`  | `object`  | metadata associated with the file (optional, [see below](#outputmetadata-object)) |
| `subtitles` | `boolean` | whether tunnels include a subtitle file                                           |

#### output.metadata object
all keys in this table are optional.

| key            | type     | description                                |
|:---------------|:---------|:-------------------------------------------|
| `album`        | `string` | album name or collection title             |
| `composer`     | `string` | composer of the track                      |
| `genre`        | `string` | track's genre(s)                           |
| `copyright`    | `string` | copyright information or ownership details |
| `title`        | `string` | title of the track or media file           |
| `artist`       | `string` | artist or creator name                     |
| `album_artist` | `string` | album's artist or creator name             |
| `track`        | `string` | track number or position in album          |
| `date`         | `string` | release date or creation date              |
| `sublanguage`  | `string` | subtitle language code (ISO 639-2)         |

#### audio object
| key         | type      | value                                                      |
|:------------|:----------|:-----------------------------------------------------------|
| `copy`      | `boolean` | defines whether audio codec data is copied                 |
| `format`    | `string`  | output audio format                                        |
| `bitrate`   | `string`  | preferred bitrate of audio format                          |
| `cover`     | `boolean` | whether tunnels include a cover art file (optional)        |
| `cropCover` | `boolean` | whether cover art should be cropped to a square (optional) |

### picker response
| key             | type     | value                                                                                          |
|:----------------|:---------|:-----------------------------------------------------------------------------------------------|
| `status`        | `string` | `picker`                                                                                       |
| `audio`         | `string` | returned when an image slideshow (such as on tiktok) has a general background audio (optional) |
| `audioFilename` | `string` | Kibelt-generated filename, returned if `audio` exists (optional)                               |
| `picker`        | `array`  | array of objects containing the individual media                                               |

#### picker object
| key          | type      | value                     |
|:-------------|:----------|:--------------------------|
| `type`       | `string`  | `photo` / `video` / `gif` |
| `url`        | `string`  |                           |
| `thumb`      | `string`  | thumbnail url (optional)  |

### error response
| key          | type     | value                         |
|:-------------|:---------|:------------------------------|
| `status`     | `string` | `error`                       |
| `error`      | `object` | error code & optional context |

#### error object
| key          | type     | value                                                     |
|:-------------|:---------|:----------------------------------------------------------|
| `code`       | `string` | machine-readable error code explaining the failure reason |
| `context`    | `object` | additional error context (optional)                       |

#### error.context object
| key          | type     | value                                                                       |
|:-------------|:---------|:----------------------------------------------------------------------------|
| `service`    | `string` | origin service (optional)                                                   |
| `limit`      | `number` | the maximum downloadable video duration or the rate limit window (optional) |

## POST `/session`
used for generating JWT tokens, if enabled. currently, Kibelt only supports
generating tokens when a [turnstile](run-an-instance.md#list-of-all-environment-variables) challenge solution
is submitted by the client.

the turnstile challenge response is submitted via the `cf-turnstile-response` header.

### response body
| key             | type       | description                                            |
|:----------------|:-----------|:-------------------------------------------------------|
| `token`         | `string`   | a `Bearer` token used for later request authentication |
| `exp`           | `number`   | number in seconds indicating the token lifetime        |

on failure, an [error response](#error-response) is returned.

## GET `/`
provides basic instance info.

### response
body type: `application/json`

| key         | type     | description                                              |
|:------------|:---------|:---------------------------------------------------------|
| `kibelt`    | `object` | information about the Kibelt instance                    |
| `git`       | `object` | information about the codebase that is currently running |

#### Kibelt object
| key                | type       | description                                    |
|:-------------------|:-----------|:-----------------------------------------------|
| `version`          | `string`   | Kibelt version                                 |
| `url`              | `string`   | instance url                                   |
| `startTime`        | `string`   | instance start time in unix milliseconds       |
| `turnstileSitekey` | `string`   | site key for a turnstile widget (optional)     |
| `services`         | `string[]` | array of services which this instance supports |

#### git object
| key         | type     | description |
|:------------|:---------|:------------|
| `commit`    | `string` | commit hash |
| `branch`    | `string` | git branch  |
| `remote`    | `string` | git remote  |

## GET `/tunnel`
endpoint for file tunnels (proxy/remux/transcode). the response is a file stream. all errors are reported via
[HTTP status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status).

### returned headers
- `Content-Length`: file size, in bytes. returned when exact final file size is known.
- `Estimated-Content-Length`: estimated file size, in bytes. returned when real `Content-Length` is not known.
a rough estimate which should NOT be used for strict size verification.
can be used to show approximate download progress in UI.

### possible HTTP status codes
- 200: OK
- 401: Unauthorized
- 403: Bad Request
- 404: Not Found
- 429: Too Many Requests (rate limit exceeded, check [RateLimit-* headers](https://www.ietf.org/archive/id/draft-polli-ratelimit-headers-02.html#name-header-specifications))
- 500: Internal Server Error.
