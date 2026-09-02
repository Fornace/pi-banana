// OpenAI-compatible provider layer for pi-banana.
// Lets banana_image / banana_vision run against any OpenAI-shaped gateway
// (mantice/llm.fornace.net included) instead of the Google API. Configured
// via the "banana" section in settings.json (written by /banana-setup):
//
//   "banana": {
//     "baseUrl": "https://llm.fornace.net/v1",
//     "apiKey": "sk-...",
//     "models": { "lite": "...", "fast": "...", "high": "..." },
//     "visionModel": "..."
//   }
//
// When no baseUrl is configured, the built-in Google path is used.
import { readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

export interface OpenAiCompatConfig {
	baseUrl: string;
	apiKey: string;
	models: { lite?: string; fast?: string; high?: string; max?: string };
	visionModel?: string;
	/** Optional provider id whose key lives in pi's auth.json (e.g. "mantice"). */
	providerName?: string;
}

export type Provider =
	| { kind: "openai-compat"; config: OpenAiCompatConfig }
	| { kind: "google" };

export function loadBananaSettings(): Partial<OpenAiCompatConfig> {
	try {
		const raw = JSON.parse(
			readFileSync(resolve(homedir(), ".pi", "agent", "settings.json"), "utf8"),
		);
		return raw?.banana ?? {};
	} catch {
		return {};
	}
}

export async function resolveProvider(ctx: any): Promise<Provider> {
	const s = loadBananaSettings();
	if (!s.baseUrl) return { kind: "google" };
	let apiKey = s.apiKey;
	if (!apiKey && s.providerName && ctx?.modelRegistry) {
		try {
			apiKey = await ctx.modelRegistry.getApiKeyForProvider(s.providerName);
		} catch { /* fall through */ }
	}
	if (!apiKey) apiKey = process.env.MANTICE_API_KEY;
	if (!apiKey) {
		throw new Error(
			"banana: baseUrl is configured but no API key was found. " +
				"Run /banana-setup again, or set banana.apiKey in settings.json.",
		);
	}
	return {
		kind: "openai-compat",
		config: {
			baseUrl: s.baseUrl.replace(/\/+$/, ""),
			apiKey,
			models: s.models ?? {},
			visionModel: s.visionModel,
			providerName: s.providerName,
		},
	};
}

// ─── OpenAI-compat calls ─────────────────────────────────────────────

/** Map aspect ratio + size tier to a generic WxH string. */
export function sizeFor(aspectRatio: string, imageSize: string): string {
	const base = imageSize === "4K" ? 4096 : imageSize === "2K" ? 2048 : 1024;
	const ratio = (() => {
		const [w, h] = aspectRatio.split(":").map(Number);
		return w && h ? w / h : 1;
	})();
	if (Math.abs(ratio - 1) < 0.01) return `${base}x${base}`;
	if (ratio > 1) return `${base}x${Math.round(base / ratio)}`;
	return `${Math.round(base * ratio)}x${base}`;
}

async function asBuffer(data: any): Promise<Buffer> {
	const first = data?.data?.[0] ?? {};
	if (first.b64_json) return Buffer.from(first.b64_json, "base64");
	if (first.url) {
		const res = await fetch(first.url);
		if (!res.ok) throw new Error(`Image download failed: ${res.statusText}`);
		return Buffer.from(await res.arrayBuffer());
	}
	throw new Error(`No image payload in response: ${JSON.stringify(data).slice(0, 300)}`);
}

async function apiPost(config: OpenAiCompatConfig, path: string, body: unknown, signal?: AbortSignal): Promise<any> {
	const res = await fetch(`${config.baseUrl}${path}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`API error (${res.status}) on ${path}: ${text.slice(0, 400)}`);
	try { return JSON.parse(text); } catch { return text; }
}

export async function openaiGenerateImage(
	config: OpenAiCompatConfig,
	opts: { model: string; prompt: string; size: string; signal?: AbortSignal },
): Promise<Buffer> {
	return asBuffer(await apiPost(config, "/images/generations", {
		model: opts.model, prompt: opts.prompt, n: 1, size: opts.size,
	}, opts.signal));
}

export async function openaiEditImage(
	config: OpenAiCompatConfig,
	opts: { model: string; prompt: string; images: { mimeType: string; data: string }[]; size: string; signal?: AbortSignal },
): Promise<Buffer> {
	const form = new FormData();
	form.append("model", opts.model);
	form.append("prompt", opts.prompt);
	form.append("size", opts.size);
	for (const img of opts.images) {
		const bytes = Buffer.from(img.data, "base64");
		const ext = img.mimeType.split("/")[1] ?? "png";
		form.append("image", new Blob([bytes], { type: img.mimeType }), `ref.${ext}`);
	}
	const res = await fetch(`${config.baseUrl}/images/edits`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}` },
		body: form,
		signal: opts.signal,
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`API error (${res.status}) on /images/edits: ${text.slice(0, 400)}`);
	return asBuffer(JSON.parse(text));
}

export async function openaiVision(
	config: OpenAiCompatConfig,
	opts: { model: string; prompt: string; images: { mimeType: string; data: string }[]; signal?: AbortSignal },
): Promise<string> {
	const content: any[] = [{ type: "text", text: opts.prompt }];
	for (const img of opts.images) {
		content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
	}
	const data = await apiPost(config, "/chat/completions", {
		model: opts.model,
		messages: [{ role: "user", content }],
	}, opts.signal);
	const text = data?.choices?.[0]?.message?.content;
	if (!text) throw new Error(`Empty vision response: ${JSON.stringify(data).slice(0, 300)}`);
	return typeof text === "string" ? text : text.map((p: any) => p.text ?? "").join("");
}

// ─── Capability probing (used by /banana-setup) ──────────────────────

export interface ProbeResult {
	models: string[];
	imageModels: string[];
	visionModels: string[];
	videoModels: string[];
	supportsImageGen: boolean;
	supportsImageEdit: boolean;
	supportsVideo: boolean;
}

const IMAGE_RE = /image|banana|seedream|imagen|gpt-image|dall-?e|flux|kolors/i;
const VISION_RE = /vision|omni|-vl\b|vl-|multimodal/i;
const VIDEO_RE = /video|sora|veo|wan|seedance|kling|hailuo|minimax-h/i;

export function classifyModels(ids: string[]): Pick<ProbeResult, "imageModels" | "visionModels" | "videoModels"> {
	return {
		imageModels: ids.filter((m) => IMAGE_RE.test(m)),
		visionModels: ids.filter((m) => VISION_RE.test(m) && !IMAGE_RE.test(m)),
		videoModels: ids.filter((m) => VIDEO_RE.test(m)),
	};
}

async function endpointReachable(baseUrl: string, apiKey: string, path: string): Promise<boolean> {
	// A missing capability answers 404; an existing endpoint answers anything else
	// (400 for a junk payload, 401 without a key).
	try {
		const res = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: "__banana_probe__", prompt: "probe" }),
		});
		return res.status !== 404;
	} catch {
		return false;
	}
}

export async function probeCapabilities(baseUrl: string, apiKey: string): Promise<ProbeResult> {
	const base = baseUrl.replace(/\/+$/, "");
	let models: string[] = [];
	const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!res.ok) {
		throw new Error(`GET ${base}/models failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
	}
	const data: any = await res.json();
	models = (data?.data ?? []).map((m: any) => m.id).filter(Boolean);
	const { imageModels, visionModels, videoModels } = classifyModels(models);
	const [supportsImageGen, supportsImageEdit, supportsVideo] = await Promise.all([
		endpointReachable(base, apiKey, "/images/generations"),
		endpointReachable(base, apiKey, "/images/edits"),
		endpointReachable(base, apiKey, "/videos/generations"),
	]);
	return { models, imageModels, visionModels, videoModels, supportsImageGen, supportsImageEdit, supportsVideo };
}
