import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "IMAGE_LOADS" }
	| { type: "IMAGE_FAILS" }
	| { type: "PICK_SQUARE" }
	| { type: "ADJUST" }
	| { type: "PICK_FILTER" }
	| { type: "SAVE" }
	| { type: "SAVE_LANDS" }
	| { type: "SAVE_FAILS" }
	| { type: "CANCEL" };

/**
 * The photo editor opened from the viewer's Edit button: loading the
 * original, crop with aspect presets, adjust sliders, filters, saving a copy
 * and the cancel path. In the code this is PhotoEditor.vue's `ready`,
 * `saving` and `active` refs plus the reactive `state` of edits, with no
 * value for "has unsaved edits" or "save failed".
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "editor",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "Edit tapped while the full-size original is still downloading: a spinner, Save copy disabled." },
			on: { IMAGE_LOADS: "ready", IMAGE_FAILS: "imageFailed" },
		},
		imageFailed: {
			meta: { description: "The original failed to download: the editor keeps the same spinner forever, with no error and no way out but Cancel." },
		},
		ready: {
			meta: { description: "The original loaded on the Crop tab: the whole photo inside a free crop frame, ratio and rotate controls below." },
			on: { PICK_SQUARE: "cropSquare", ADJUST: "adjusted", PICK_FILTER: "filtered" },
		},
		cropSquare: {
			meta: { description: "Square picked: the crop frame snaps to a centred square and dims the rest." },
		},
		adjusted: {
			meta: { description: "Adjust tab with Brightness raised to 40 and Warmth to 30: the canvas previews the change." },
			on: { SAVE: "saving", CANCEL: "discarded" },
		},
		filtered: {
			meta: { description: "Filters tab with Mono picked: the preview turns black and white and the Mono swatch is ringed." },
		},
		saving: {
			meta: { description: "Save copy tapped while the upload is in flight: the button shows a spinner, everything else stays live." },
			on: { SAVE_LANDS: "saved", SAVE_FAILS: "saveFailed" },
		},
		saved: {
			meta: { description: "The copy uploaded: the editor closes back to the viewer with a Saved a copy next to the original toast." },
		},
		saveFailed: {
			meta: { description: "The upload failed twice (its folder, then the upload folder): an error toast, the editor stays open with the edits." },
		},
		discarded: {
			meta: { description: "Cancel with unsaved edits: the editor closes at once with no confirm and the edits are gone." },
		},
	},
});

interface Row {
	name: string;
	file_name: string;
	mime_type?: string;
	is_favourite?: string | null;
	taken: string;
	live_video?: string | null;
	motion_photo?: number;
}

const ORIGINAL = /\/api\/method\/photos\.api\.media\.content\?.*display=2/;
const UPLOAD = "**/api/method/suite.drive.api.files.upload_file*";
const DRIVE = "suite.drive.api.files";
const imageHolds = new WeakMap<Scene, Hold>();
const saveHolds = new WeakMap<Scene, Hold>();

async function pickPhoto(scene: Scene): Promise<Row> {
	const page = await scene.call<{ rows: Row[] }>("photos.api.photos.timeline", { limit: 80 });
	const today = new Date().toISOString().slice(0, 10);
	const row = page.rows.find(
		(each) =>
			each.mime_type?.startsWith("image/") && !each.live_video && !each.motion_photo && each.taken.slice(0, 10) < today,
	);
	if (!row) throw new Error("No settled photo to edit in the timeline");
	return row;
}

const saveButton = (scene: Scene) => scene.page.getByRole("button", { name: "Save copy" });
const panel = (scene: Scene) => scene.page.locator("div.fixed.inset-0.z-\\[60\\]");

async function tapTab(scene: Scene, label: string): Promise<void> {
	await panel(scene).getByRole("button", { name: label, exact: true }).tap();
}

async function removeCopy(scene: Scene, copy: string): Promise<void> {
	const found = await scene.call<{ status?: string } | null>("frappe.client.get_value", {
		doctype: "File",
		filters: copy,
		fieldname: "status",
	});
	if (found?.status === "Active") await scene.call(`${DRIVE}.remove_or_restore`, { entity_names: [copy] });
	await scene.call(`${DRIVE}.delete_entities`, { entity_names: [copy] });
}

export const editor = defineFlow<Event>({
	id: "editor",
	title: "Photo editor",
	source: "frontend/src/components/PhotoEditor.vue, frontend/src/components/Lightbox.vue",
	machine,
	async enter(scene) {
		const target = await pickPhoto(scene);
		imageHolds.set(scene, await scene.hold(ORIGINAL));
		await scene.goto("/");
		const tile = scene.page.locator(`[data-photo="${target.name}"]`).first();
		await expect(tile).toBeAttached({ timeout: 30_000 });
		await tile.scrollIntoViewIfNeeded();
		await tile.tap();
		const edit = scene.page.locator(".viewer-action").filter({ hasText: "Edit" });
		await expect(edit).toBeVisible();
		await edit.tap();
		await expect(saveButton(scene)).toBeDisabled();
	},
	events: {
		async IMAGE_LOADS(scene) {
			await imageHolds.get(scene)?.release();
			await expect(saveButton(scene)).toBeEnabled();
			await expect(panel(scene).locator("canvas")).toBeVisible();
		},
		async IMAGE_FAILS(scene) {
			await imageHolds.get(scene)?.abort();
			await scene.settle(3_000);
			await expect(saveButton(scene)).toBeDisabled();
		},
		async PICK_SQUARE(scene) {
			const square = panel(scene).getByRole("button", { name: "Square", exact: true });
			await square.tap();
			await expect(square).toHaveClass(/bg-white/);
		},
		async ADJUST(scene) {
			await tapTab(scene, "Adjust");
			const sliders = panel(scene).locator("input[type=range]");
			await sliders.nth(0).fill("40");
			await sliders.nth(3).fill("30");
			await expect(panel(scene).getByText("40", { exact: true })).toBeVisible();
			await expect(panel(scene).getByText("30", { exact: true })).toBeVisible();
		},
		async PICK_FILTER(scene) {
			await tapTab(scene, "Filters");
			await panel(scene).getByRole("button", { name: "Mono" }).tap();
			await expect(panel(scene).locator("img.ring-2")).toHaveCount(1);
		},
		async SAVE(scene) {
			saveHolds.set(scene, await scene.hold(UPLOAD));
			const copies: string[] = [];
			scene.page.on("response", async (each) => {
				if (!each.url().includes("upload_file") || !each.ok()) return;
				const name = ((await each.json().catch(() => ({}))) as { message?: { name?: string } }).message?.name;
				if (name) copies.push(name);
			});
			scene.defer(async () => {
				for (const copy of copies) await removeCopy(scene, copy);
			});
			await saveButton(scene).tap();
			await expect(saveButton(scene)).toBeDisabled();
		},
		async SAVE_LANDS(scene) {
			await saveHolds.get(scene)?.release();
			await expect(scene.page.getByText("Saved a copy next to the original")).toBeVisible({ timeout: 30_000 });
			await expect(saveButton(scene)).toHaveCount(0);
		},
		async SAVE_FAILS(scene) {
			await saveHolds.get(scene)?.abort();
			await expect(saveButton(scene)).toBeEnabled({ timeout: 30_000 });
			await expect(scene.page.locator("[data-sonner-toast]").first()).toBeVisible();
		},
		async CANCEL(scene) {
			await scene.page.getByRole("button", { name: "Cancel" }).tap();
			await expect(saveButton(scene)).toHaveCount(0);
			await expect(scene.page.locator(".viewer-action").filter({ hasText: "Edit" })).toBeVisible();
		},
	},
});
