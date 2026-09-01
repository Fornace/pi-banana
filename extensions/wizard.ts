// /banana-setup: interactive provider wizard.
// Asks for a base URL + API key, probes the endpoint for image and vision
// capabilities, lets the user confirm model assignments per quality tier,
// and persists the result to settings.json under the "banana" key.
import { writeFileSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { probeCapabilities, classifyModels } from "./providers.ts";

const SETTINGS_PATH = resolve(homedir(), ".pi", "agent", "settings.json");

function persistBananaConfig(cfg: Record<string, unknown>): void {
	let raw: Record<string, unknown> = {};
	try { raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")); } catch { /* new file */ }
	raw.banana = cfg;
	writeFileSync(SETTINGS_PATH, JSON.stringify(raw, null, 2));
}

function pickDefault(candidates: string[], hint: RegExp): string | undefined {
	return candidates.find((m) => hint.test(m)) ?? candidates[0];
}

export interface ConfigureOptions {
	baseUrl: string;
	apiKey?: string;
	visionModel?: string;
}

/** Non-interactive provider configuration: resolves the key, probes the
 * endpoint, auto-assigns quality tiers, and persists to settings.json.
 * Returns a human-readable report. Used by banana_configure and the wizard. */
export async function configureBananaProvider(ctx: any, opts: ConfigureOptions): Promise<string> {
	const baseUrl = opts.baseUrl.replace(/\/+$/, "");
	let apiKey = opts.apiKey;
	if (!apiKey && ctx?.modelRegistry) {
		for (const p of ["mantice", "google"]) {
			try {
				apiKey = await ctx.modelRegistry.getApiKeyForProvider(p);
				if (apiKey) break;
			} catch { /* next */ }
		}
	}
	if (!apiKey) apiKey = process.env.MANTICE_API_KEY;
	if (!apiKey) throw new Error("No API key found: pass apiKey, log in via /login, or set MANTICE_API_KEY.");

	const probe = await probeCapabilities(baseUrl, apiKey);
	if (!probe.supportsImageGen || probe.imageModels.length === 0) {
		throw new Error("Endpoint has no image generation models. Nothing was saved.");
	}
	const pick = (hint: RegExp, fallback?: string) =>
		probe.imageModels.find((m) => hint.test(m)) ?? fallback ?? probe.imageModels[0];
	const models = {
		lite: pick(/lite|fast|turbo|mini/i),
		fast: pick(/^(?!.*(lite|high|max|pro|ultra)).*$/i),
		high: pick(/max|high|pro|ultra/i),
	};
	const visionModel = opts.visionModel ?? probe.visionModels[0];
	persistBananaConfig({ baseUrl, apiKey, models, ...(visionModel ? { visionModel } : {}) });
	return [
		`Configured banana on ${baseUrl}:`,
		`  lite  = ${models.lite}`,
		`  fast  = ${models.fast}`,
		`  high  = ${models.high}`,
		visionModel ? `  vision = ${visionModel}` : "  vision = (google default kept)",
		`Image edit endpoint: ${probe.supportsImageEdit ? "available" : "not available"}.`,
		"banana_image and banana_vision now use this provider.",
	].join("\n");
}

export async function runBananaSetup(ctx: any): Promise<void> {
	const ui = ctx.ui;
	ui.notify("Banana setup: configure an OpenAI-compatible image provider (mantice works).", "info");

	// Prefill base URL and key from the pi credential store when available.
	let preKey: string | undefined;
	for (const p of ["mantice", "google"]) {
		try {
			preKey = await ctx.modelRegistry?.getApiKeyForProvider(p);
			if (preKey) break;
		} catch { /* next */ }
	}
	const baseUrl = (await ui.input("Provider base URL (OpenAI-compatible)", "https://llm.fornace.net/v1"))?.trim();
	if (!baseUrl) return;
	const apiKey = (await ui.input("API key", preKey ?? "sk-..."))?.trim();
	if (!apiKey) return;

	ui.notify("Probing capabilities…", "info");
	let probe;
	try {
		probe = await probeCapabilities(baseUrl, apiKey);
	} catch (err: any) {
		ui.notify(`Probe failed: ${err.message}`, "error");
		return;
	}

	if (probe.models.length === 0) {
		ui.notify("No models listed on this endpoint.", "error");
		return;
	}

	const report = [
		`Models: ${probe.models.length} total`,
		`Image models: ${probe.imageModels.join(", ") || "none detected"}`,
		`Vision models: ${probe.visionModels.join(", ") || "none detected"}`,
		`Video models: ${probe.videoModels.join(", ") || "none detected"}`,
		`Endpoints: image gen ${probe.supportsImageGen ? "✓" : "✗"}, image edit ${probe.supportsImageEdit ? "✓" : "✗"}, video ${probe.supportsVideo ? "✓" : "✗"}`,
	].join("\n");
	ui.notify(report, "info");

	if (!probe.supportsImageGen || probe.imageModels.length === 0) {
		ui.notify("This endpoint has no image generation models. Setup aborted, Google stays the default.", "error");
		return;
	}

	// Auto-assign tiers, then let the user confirm each.
	const tiers = [
		{ key: "lite", hint: /lite|fast|turbo|mini/i, label: "lite tier (cheapest)" },
		{ key: "fast", hint: /^(?!.*(lite|high|max|pro)).*$/i, label: "fast tier (default)" },
		{ key: "high", hint: /max|high|pro|ultra/i, label: "high tier (top quality)" },
	] as const;
	const models: Record<string, string> = {};
	for (const t of tiers) {
		const suggestion = pickDefault(probe.imageModels, t.hint) ?? probe.imageModels[0];
		const options = [suggestion, ...probe.imageModels.filter((m) => m !== suggestion)];
		const choice = await ui.select(`Model for ${t.label}`, options);
		if (!choice) return;
		models[t.key] = choice;
	}

	let visionModel: string | undefined;
	if (probe.visionModels.length > 0) {
		const v = await ui.select("Model for banana_vision (image analysis)", [
			...probe.visionModels,
			"(keep Google default)",
		]);
		visionModel = v && !v.startsWith("(") ? v : undefined;
	}

	persistBananaConfig({ baseUrl, apiKey, models, ...(visionModel ? { visionModel } : {}) });
	ui.notify(
		`Saved. banana_image now calls ${baseUrl} (${models.fast}/${models.lite}/${models.high}). ` +
			"Run /banana-setup again to change, or delete \"banana\" from settings.json to return to Google.",
		"info",
	);
}
