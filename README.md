# pi-banana

![pi-banana banner](https://fcskjxapefiqdclrvbtw.supabase.co/storage/v1/object/public/assets/pi-packages/pi-banana-banner.jpg)

Generate, edit, and analyze images directly inside [pi](https://github.com/badlogic/pi-mono) using Google's **Nano Banana 2** (`gemini-3.1-flash-image-preview`), **Nano Banana Pro** (`gemini-3-pro-image-preview`), and **Gemini Vision**.

- **Image Generation & Editing** — Create images from scratch or pass `referenceImages: ["./logo.png"]` to edit existing pictures.
- **Multimodal Vision** — Analyze, describe, or extract text from images using `gemini-3.1-flash-lite` (fast) or `gemini-3.1-pro-preview` (deep reasoning).
- **Inline preview** in Kitty / iTerm2 / WezTerm — generated images show up right under the tool call.
- **Auto-save** to `./generated/` so the agent and you both have a real file to refer back to.
- **One env var** — `GOOGLE_API_KEY`. Works with both AI Studio (`AIza…`) and Vertex AI Express (`AQ.…`) keys.

## Install

```sh
pi install pi-banana
```

If pi doesn't resolve the bare name, use the explicit form: `pi install npm:pi-banana`.

Or for a single-session try:

```sh
pi -e pi-banana   # or: pi -e npm:pi-banana
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
> *"What color is the car in `./assets/photo.jpg`?"*
>
> *"Extract the text from these three receipts."*

The model calls `banana_image` or `banana_vision` automatically. 

## Tools

### 1. `banana_image`

> Renamed from `generate_image` in v2.0.1 to avoid colliding with `@benvargas/pi-antigravity-image-gen`. Both extensions can now coexist in the same pi install.

| Param | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | Required. What to draw, or what to change about the reference image. |
| `aspectRatio` | enum | `1:1` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` |
| `imageSize` | enum | `1K` | `1K`, `2K`, `4K`. `4K` requires `quality=high`. |
| `quality` | enum | `fast` | `fast` = Nano Banana 2 (~3–10 s, cheapest). `high` = Nano Banana Pro (slower, top quality). |
| `referenceImages` | array | — | Optional array of paths (PNG/JPEG/WebP/GIF) to edit or use for composition instead of generating from scratch. |
| `outputPath` | string | `./generated/<slug>-<ts>.png` | Optional output path. Parent dirs are created. |

### 2. `banana_vision`

| Param | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | Required. What you want to know about the image(s) (e.g. 'Describe this image', 'Extract the text'). |
| `imagePaths` | array | — | Required. Array of paths to existing images to analyze. |
| `quality` | enum | `fast` | `fast` = gemini-3.1-flash-lite (fast/cheap). `high` = gemini-3.1-pro-preview (slower, deep reasoning). |

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

## From the same author

By [Francesco Frapporti](https://fornace.it) at [Fornace](https://fornace.it).

- **[pi-bench](https://github.com/fornace/pi-bench)** — LLM benchmark toolkit for pi. Probes every available model to find the fastest and cheapest. All package banners in this ecosystem were created with pi-banana.
- **[pi-recap](https://github.com/fornace/pi-recap)** — Always-visible session recap panel for pi. Never scroll back to remember what you were doing.
- **[pi-alibaba-models](https://github.com/fornace/pi-alibaba-models)** — Complete Alibaba provider for pi: Qwen, DeepSeek, Kimi, GLM, MiniMax with native thinking levels.
- **[pi-notte-theme](https://github.com/fornace/pi-notte-theme)** — Notte: a true-dark pi theme where darkness has color and text glows like terminal phosphor.

## Development

```sh
npm install
npm run typecheck             # tsc --noEmit
GOOGLE_API_KEY=… npm run smoke  # full live-API smoke test in _tmp/
```

## License

MIT
