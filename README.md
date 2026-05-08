# pi-banana

![pi-banana banner](https://fcskjxapefiqdclrvbtw.supabase.co/storage/v1/object/public/assets/pi-packages/pi-banana-banner.jpg)

Generate and edit images directly inside [pi](https://github.com/badlogic/pi-mono) using Google's **Nano Banana 2** (`gemini-3.1-flash-image-preview`) and **Nano Banana Pro** (`gemini-3-pro-image-preview`).

- **Inline preview** in Kitty / iTerm2 / WezTerm — image shows up right under the tool call, no copy-pasting paths.
- **Reference-image editing** — pass `referenceImage: "./logo.png"` and the model edits that picture instead of starting from scratch.
- **Auto-save** to `./generated/` so the agent and you both have a real file to refer back to.
- **One env var** — `GOOGLE_API_KEY`. Works with both AI Studio (`AIza…`) and Vertex AI Express (`AQ.…`) keys.
- **Backend-aware** — Vertex publishes the `-preview` model id, AI Studio sometimes publishes the GA name; the extension transparently retries the other variant on 404 so it just works.

## Install

```sh
pi install npm:pi-banana
```

Or for a single-session try:

```sh
pi -e npm:pi-banana
```

Then export your key:

```sh
export GOOGLE_API_KEY="AIza…"   # AI Studio key, or
export GOOGLE_API_KEY="AQ.…"    # Vertex AI Express key
```

Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Usage

Just ask pi for what you want:

> *"Generate a 16:9 wallpaper of a foggy redwood forest at dawn"*
>
> *"Edit `./generated/logo-20260508.png` — make the background transparent"*
>
> *"Draw a pixel-art banana with sunglasses, 1:1, save it as `./assets/mascot.png`"*

The model calls `generate_image` automatically. The PNG is shown inline and written to disk.

## Tool: `banana_image`

> Renamed from `generate_image` in v2.0.1 to avoid colliding with `@benvargas/pi-antigravity-image-gen`. Both extensions can now coexist in the same pi install.

| Param | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | Required. What to draw, or what to change about the reference image. |
| `aspectRatio` | enum | `1:1` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `imageSize` | enum | `1K` | `1K`, `2K`, `4K`. `4K` requires `quality=high`. |
| `quality` | enum | `fast` | `fast` = Nano Banana 2 (~3–10 s, cheapest). `high` = Nano Banana Pro (slower, top quality). |
| `referenceImage` | string | — | Optional path to a PNG/JPEG/WebP/GIF to edit instead of generating from scratch. |
| `outputPath` | string | `./generated/<slug>-<ts>.png` | Optional output path. Parent dirs are created. |

## Configuration

Two env vars adjust defaults without touching tool parameters:

| Env var | Default | Effect |
|---|---|---|
| `PI_IMAGE_DIR` | `generated` | Default save directory (relative paths resolve against cwd). |
| `PI_IMAGE_QUALITY` | `fast` | Default quality if the model doesn't pass one. |

## How is this different from `@benvargas/pi-antigravity-image-gen`?

| | pi-banana | @benvargas |
|---|---|---|
| Auth | `GOOGLE_API_KEY` env var | OAuth via Antigravity (`pi /login`) |
| Models | Flash + Pro | Pro only |
| Image edit (input picture) | ✅ | ❌ |
| Auto-save default | ✅ to `./generated/` | ❌ disabled by default |
| Aspect ratios | 10 | 10 |
| Inline terminal preview | ✅ | ✅ |

If you have an Antigravity OAuth setup and want quota tracking, benvargas is great. If you just want to drop in an API key and start making pictures, this one is simpler.

## Development

```sh
npm install
npm run typecheck             # tsc --noEmit
GOOGLE_API_KEY=… npm run smoke  # full live-API smoke test in _tmp/
```

## License

MIT
