# Changelog

## 2.4.0

> Move image generation to GA model ids and add the Nano Banana 2 Lite tier (Gemini API changelog, verified 2026-09-01).

- `fast` now uses GA `gemini-3.1-flash-image` (Nano Banana 2) instead of the `-preview` id (GA since 2026-05-28).
- `high` now uses GA `gemini-3-pro-image` (Nano Banana Pro) instead of the `-preview` id.
- New `lite` quality tier: `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite, GA 2026-06-30), optimized for ultra-low latency and cost.
- The 404 fallback now retries the alternate GA/preview id in both directions, so Vertex and AI Studio keys keep working on either backend.
- Fixed a stale type in `buildClient` (modelRegistry comes from ExtensionContext).

## 2.3.0

- Prior release.
