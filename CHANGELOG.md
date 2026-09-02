# Changelog

## 2.5.2

- Added a `max` quality tier for premium image work. With the Mantice configuration, `max` routes to `fornace-image-max`, backed by GPT Image 2.
- The provider wizard now assigns separate high and max candidates when the endpoint exposes them.

## 2.5.1

- New `banana_configure` tool: non-interactive provider setup for AI agents (probe, auto-assign tiers, persist). `/banana-setup` stays for humans.

## 2.5.0

> OpenAI-compatible provider support with interactive setup (works with mantice).

- New `/banana-setup` wizard: enter a base URL and API key (prefilled from pi credentials when available), the wizard probes the endpoint, classifies image/vision/video models, checks `/images/generations`, `/images/edits`, and `/videos/generations` support, and lets you pick a model per quality tier.
- When a provider is configured, banana_image and banana_vision call it via the OpenAI shapes instead of the Google API. Delete the "banana" section from settings.json to return to Google.
- Verified live against mantice (llm.fornace.net): 9 image models detected, edit endpoint present, real generation roundtrip.

## 2.4.0

> Move image generation to GA model ids and add the Nano Banana 2 Lite tier (Gemini API changelog, verified 2026-09-01).

- `fast` now uses GA `gemini-3.1-flash-image` (Nano Banana 2) instead of the `-preview` id (GA since 2026-05-28).
- `high` now uses GA `gemini-3-pro-image` (Nano Banana Pro) instead of the `-preview` id.
- New `lite` quality tier: `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite, GA 2026-06-30), optimized for ultra-low latency and cost.
- The 404 fallback now retries the alternate GA/preview id in both directions, so Vertex and AI Studio keys keep working on either backend.
- Fixed a stale type in `buildClient` (modelRegistry comes from ExtensionContext).

## 2.3.0

- Prior release.
