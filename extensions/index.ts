/**
 * pi-image
 *
 * Image generation + editing tool for pi, powered by Google's
 *   - Nano Banana 2  (gemini-3.1-flash-image-preview)  — fast, cheap, default
 *   - Nano Banana Pro (gemini-3-pro-image-preview)     — top quality, slower
 *
 * Returns images as flat { type: "image", data, mimeType } content blocks so
 * pi-coding-agent renders them inline (Kitty / iTerm2). Also writes the file
 * to disk so the agent and the user always have a path to refer back to.
 *
 * Auth: GOOGLE_API_KEY in the environment.
 *   - AI Studio keys (AIza...) hit the Gemini API.
 *   - Vertex AI Express keys (AQ....) automatically switch to Vertex.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	Box,
	Container,
	Image,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import { GoogleGenAI } from "@google/genai";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { Type } from "typebox";

// ─── Config ────────────────────────────────────────────────────────────────

// Per Vertex AI / AI Studio docs, gemini-3.1-flash-image supports a wider set
// than older Imagen models. Keep to the broadly-supported subset.
const ASPECT_RATIOS = [
	"1:1",
	"2:3",
	"3:2",
	"3:4",
	"4:3",
	"4:5",
	"5:4",
	"9:16",
	"16:9",
	"21:9",
] as const;
const IMAGE_SIZES = ["1K", "2K", "4K"] as const;
const QUALITY = ["fast", "high"] as const;

// Resolved against a live Vertex Express (AQ.*) key on 2026-05-08:
//   gemini-3.1-flash-image          → 404
//   gemini-3.1-flash-image-preview  → ok  (Nano Banana 2)
//   gemini-3-pro-image              → 404
//   gemini-3-pro-image-preview      → ok  (Nano Banana Pro)
// AI Studio keys (AIza*) sometimes publish the un-suffixed GA names.
// `callWithModelFallback` below transparently retries with `-preview`
// if the un-suffixed id 404s, so both backends just work.
const MODEL_FOR_QUALITY: Record<(typeof QUALITY)[number], string> = {
	fast: "gemini-3.1-flash-image-preview", // Nano Banana 2
	high: "gemini-3-pro-image-preview", // Nano Banana Pro
};

const DEFAULT_OUTPUT_DIR =
	process.env.PI_IMAGE_DIR?.trim() || "generated";
const DEFAULT_QUALITY = (process.env.PI_IMAGE_QUALITY as
	| "fast"
	| "high"
	| undefined) ?? "fast";
const SUPPORTED_INPUT_MIME = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildClient(): GoogleGenAI {
	const apiKey = process.env.GOOGLE_API_KEY;
	if (!apiKey) {
		throw new Error(
			"GOOGLE_API_KEY not set. Get one at https://aistudio.google.com/apikey (AIza…) " +
				"or use a Vertex AI Express key (AQ.…) — both work.",
		);
	}
	// AQ.* express keys authenticate against Vertex; AIza* against Gemini API.
	return new GoogleGenAI({
		apiKey,
		...(apiKey.startsWith("AQ.") ? { vertexai: true } : {}),
	});
}

function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "image"
	);
}

function timestamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
		`-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
	);
}

function extForMime(mime: string): string {
	switch (mime.toLowerCase()) {
		case "image/png":
			return ".png";
		case "image/jpeg":
		case "image/jpg":
			return ".jpg";
		case "image/webp":
			return ".webp";
		case "image/gif":
			return ".gif";
		default:
			return ".png";
	}
}

function mimeFromExt(path: string): string {
	switch (extname(path).toLowerCase()) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".webp":
			return "image/webp";
		case ".gif":
			return "image/gif";
		default:
			return "image/png";
	}
}

async function loadReferenceImage(
	cwd: string,
	pathArg: string,
): Promise<{ data: string; mimeType: string }> {
	// Strip leading @ — some models include it in path arguments.
	const cleaned = pathArg.replace(/^@/, "");
	const abs = isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
	if (!existsSync(abs)) {
		throw new Error(`Reference image not found: ${abs}`);
	}
	const mimeType = mimeFromExt(abs);
	if (!SUPPORTED_INPUT_MIME.has(mimeType)) {
		throw new Error(
			`Unsupported reference image type: ${mimeType}. Use PNG, JPEG, WebP, or GIF.`,
		);
	}
	const buf = await readFile(abs);
	return { data: buf.toString("base64"), mimeType };
}

async function resolveOutputPath(
	cwd: string,
	prompt: string,
	mimeType: string,
	override: string | undefined,
): Promise<string> {
	if (override) {
		const cleaned = override.replace(/^@/, "");
		const abs = isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
		await mkdir(resolve(abs, ".."), { recursive: true });
		return abs;
	}
	const dir = isAbsolute(DEFAULT_OUTPUT_DIR)
		? DEFAULT_OUTPUT_DIR
		: resolve(cwd, DEFAULT_OUTPUT_DIR);
	await mkdir(dir, { recursive: true });
	return resolve(dir, `${slugify(prompt)}-${timestamp()}${extForMime(mimeType)}`);
}

// ─── Extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "banana_image",
		label: "Banana Image",
		description:
			"Generate or edit a PNG/JPEG image with Google's Nano Banana 2 " +
			"(Gemini 3.1 Flash Image) or Nano Banana Pro. The image is shown " +
			"inline in the terminal AND saved to disk so it can be re-used. " +
			"Pass `referenceImages` (array of paths) to iterate on existing pictures.",
		promptSnippet:
			"Generate or edit images with Google Nano Banana via the GOOGLE_API_KEY env var.",
		promptGuidelines: [
			"Call banana_image when the user asks to create, draw, illustrate, or edit a picture.",
			"For tweaks like 'make the sky purple', pass the previous file path (or paths) as referenceImages to banana_image.",
			"Default quality 'fast' is right for most asks; switch to 'high' only when the user explicitly wants top quality.",
		],
		parameters: Type.Object({
			prompt: Type.String({
				description:
					"What to draw. Be specific about subject, style, lighting, " +
					"composition. For edits with a reference image, describe only the change.",
			}),
			aspectRatio: Type.Optional(
				StringEnum(ASPECT_RATIOS, {
					description: "Aspect ratio of the output image.",
					default: "1:1",
				}),
			),
			imageSize: Type.Optional(
				StringEnum(IMAGE_SIZES, {
					description:
						"Largest dimension of the image. 4K is only available on quality=high.",
					default: "1K",
				}),
			),
			quality: Type.Optional(
				StringEnum(QUALITY, {
					description:
						"'fast' = Nano Banana 2 (default, ~3s, cheap). 'high' = Nano Banana Pro (slower, top quality).",
					default: DEFAULT_QUALITY,
				}),
			),
			referenceImages: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Optional path(s) to existing image(s) (PNG/JPEG/WebP/GIF) to edit or iterate on. " +
						"Relative paths resolve to the current working directory.",
				})
			),
			outputPath: Type.Optional(
				Type.String({
					description:
						"Optional output path. Defaults to ./generated/<slug>-<timestamp>.png " +
						"(override the dir with PI_IMAGE_DIR).",
				}),
			),
		}),

		prepareArguments(args: any) {
			if (args.referenceImage !== undefined) {
				args.referenceImages = Array.isArray(args.referenceImage)
					? args.referenceImage
					: [args.referenceImage];
				delete args.referenceImage;
			}
			return args;
		},

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const aspectRatio = params.aspectRatio ?? "1:1";
			const imageSize = params.imageSize ?? "1K";
			const quality = params.quality ?? DEFAULT_QUALITY;
			const model = MODEL_FOR_QUALITY[quality];
			const cwd = ctx.cwd;

			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Cancelled." }], details: {} };
			}
			if (imageSize === "4K" && quality !== "high") {
				throw new Error(
					"imageSize=4K requires quality='high' (Nano Banana Pro).",
				);
			}

			const client = buildClient();

			// Build content parts — text + (optional) reference image.
			const parts: Array<{
				text?: string;
				inlineData?: { mimeType: string; data: string };
			}> = [];
			let editing = false;
			if (params.referenceImages && params.referenceImages.length > 0) {
				for (const refPath of params.referenceImages) {
					const ref = await loadReferenceImage(cwd, refPath);
					parts.push({ inlineData: ref });
					editing = true;
				}
			}
			parts.push({ text: params.prompt });

			const verbLabel = editing ? "Editing" : "Generating";
			onUpdate?.({
				content: [
					{
						type: "text",
						text: `🎨 ${verbLabel} ${aspectRatio} ${imageSize} image with ${quality === "fast" ? "Nano Banana 2" : "Nano Banana Pro"}…`,
					},
				],
				details: { model, aspectRatio, imageSize, quality, editing },
			});

			const callWithFallback = async (modelId: string) => {
				try {
					return await client.models.generateContent({
						model: modelId,
						contents: [{ role: "user", parts }],
						config: {
							responseModalities: ["IMAGE"],
							imageConfig: { aspectRatio, imageSize },
							abortSignal: signal,
						},
					});
				} catch (err: any) {
					const msg = String(err?.message ?? err);
					// Vertex publishes the `-preview` id while AI Studio sometimes
					// publishes the GA id. Retry the other variant on 404.
					const is404 = /\b404\b|NOT_FOUND|not found/i.test(msg);
					if (is404 && !modelId.endsWith("-preview")) {
						return await client.models.generateContent({
							model: `${modelId}-preview`,
							contents: [{ role: "user", parts }],
							config: {
								responseModalities: ["IMAGE"],
								imageConfig: { aspectRatio, imageSize },
								abortSignal: signal,
							},
						});
					}
					if (is404 && modelId.endsWith("-preview")) {
						return await client.models.generateContent({
							model: modelId.replace(/-preview$/, ""),
							contents: [{ role: "user", parts }],
							config: {
								responseModalities: ["IMAGE"],
								imageConfig: { aspectRatio, imageSize },
								abortSignal: signal,
							},
						});
					}
					throw err;
				}
			};

			let response;
			try {
				response = await callWithFallback(model);
			} catch (err: any) {
				// Surface API errors verbatim — they tell the user (and the agent)
				// exactly what to fix (bad key, model not enabled, etc).
				throw new Error(
					`Google image API error: ${err?.message ?? String(err)}`,
				);
			}

			const candidate = response.candidates?.[0];
			const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);
			if (!imagePart?.inlineData?.data) {
				const reason = candidate?.finishReason ?? "unknown";
				const safety = candidate?.safetyRatings
					?.filter((r: any) => r.blocked || r.probability === "HIGH")
					.map((r: any) => r.category)
					.join(", ");
				const textOut = response.candidates?.[0]?.content?.parts
					?.map((p) => p.text)
					.filter(Boolean)
					.join(" ");
				throw new Error(
					`No image returned (finishReason=${reason}` +
						(safety ? `, blocked=${safety}` : "") +
						`). ${textOut ?? ""}`.trim(),
				);
			}

			const base64 = imagePart.inlineData.data;
			const mimeType = imagePart.inlineData.mimeType ?? "image/png";
			const outPath = await resolveOutputPath(
				cwd,
				params.prompt,
				mimeType,
				params.outputPath,
			);
			await writeFile(outPath, Buffer.from(base64, "base64"));

			const refStr = params.referenceImages?.join(", ") ?? "";
			const summary = editing
				? `Edited "${refStr}" → ${outPath}`
				: `Generated → ${outPath}`;

			return {
				// Flat ImageContent block — pi-coding-agent auto-renders inline
				// in Kitty/iTerm2 terminals. Older terminals get the text fallback.
				content: [
					{ type: "text", text: summary },
					{ type: "image", data: base64, mimeType },
				],
				details: {
					prompt: params.prompt,
					model,
					quality,
					aspectRatio,
					imageSize,
					mimeType,
					outputPath: outPath,
					editing,
					referenceImages: params.referenceImages,
				},
			};
		},

		renderResult(result, _options, theme) {
			const { details, content } = result;
			const container = new Container();

			// 1. Summary
			const summaryPart = content.find((c: any) => c.type === "text");
			const summaryText = (summaryPart && summaryPart.type === "text") ? summaryPart.text : "";
			container.addChild(new Text(theme.fg("success", "✔ " + summaryText), 1, 0));

			// 2. Image
			const imagePart = content.find((c: any) => c.type === "image");
			if (imagePart && imagePart.type === "image") {
				container.addChild(
					new Image(imagePart.data, imagePart.mimeType, {
						...theme,
						fallbackColor: (s: string) => theme.fg("muted", s),
					}, {
						maxWidthCells: 80,
						maxHeightCells: 24,
					})
				);
			}

			if (!details) return container;

			const {
				prompt,
				model,
				quality,
				aspectRatio,
				imageSize,
				outputPath,
			} = details as any;

			container.addChild(new Spacer(1));

			// 3. Settings Card
			const settingsBox = new Box(1, 1, (s) => theme.bg("customMessageBg", s));
			const settingsContainer = new Container();

			settingsContainer.addChild(
				new Text(theme.fg("accent", theme.bold("🛠️  GENERATION SETTINGS")), 0, 0)
			);
			settingsContainer.addChild(new Spacer(1));

			const addSetting = (label: string, value: string) => {
				settingsContainer.addChild(
					new Text(
						theme.fg("muted", label.padEnd(10)) + theme.fg("text", String(value)),
						0,
						0
					)
				);
			};

			if (prompt) addSetting("Prompt", prompt);
			if (model) addSetting("Model", model);
			if (quality) addSetting("Quality", quality);
			if (aspectRatio) addSetting("Aspect", aspectRatio);
			if (imageSize) addSetting("Size", imageSize);
			if (outputPath) addSetting("Path", outputPath);

			settingsBox.addChild(settingsContainer);
			container.addChild(settingsBox);

			return container;
		},
	});
}
