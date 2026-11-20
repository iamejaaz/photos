import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "DRAG_START" }
	| { type: "SPLIT" }
	| { type: "SELECT_PART" }
	| { type: "DELETE_PART" }
	| { type: "UNDO" }
	| { type: "SAVE" }
	| { type: "SAVE_FAILS" }
	| { type: "SERVER_ANSWERS" };

/**
 * The video trim editor: drag the ends to trim, Split at the white line to cut
 * the video into parts, tap a part and Delete it, Undo, then Save copy, which
 * sends the kept parts to the server. In the code this is VideoTrimmer.vue
 * (`cuts`, `removed`, `selected`, `history`, `range`) and trimVideo in
 * resources/edit.ts.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "trim",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "Trim tapped on a video while it is still loading: the frame strip shows a spinner, Save copy is off." },
			on: { LOADS: "ready" },
		},
		ready: {
			meta: { description: "The video is ready: a strip of frames with a white frame and handles at both ends, the white line where playback is, and Split, Delete part and Undo below." },
			on: { DRAG_START: "endsTrimmed", SPLIT: "split" },
		},
		endsTrimmed: {
			meta: { description: "The start handle dragged in: the cut part is darkened and the length at the top drops." },
		},
		split: {
			meta: { description: "Split tapped at two places: two black cuts divide the video into three parts, and the part after the last cut is selected." },
			on: { SELECT_PART: "partSelected" },
		},
		partSelected: {
			meta: { description: "The middle part tapped: it gets a yellow outline and Delete part turns on." },
			on: { DELETE_PART: "partDeleted" },
		},
		partDeleted: {
			meta: { description: "Delete part tapped: the part is darkened with a trash icon, the length drops, and the button becomes Keep part." },
			on: { UNDO: "split", SAVE: "saving", SAVE_FAILS: "saveFailed" },
		},
		saving: {
			meta: { description: "Save copy tapped and the request is still out: the button spins." },
			on: { SERVER_ANSWERS: "saved" },
		},
		saveFailed: {
			meta: { description: "The server refused the trim: an error toast with the reason, and the editor stays open." },
		},
		saved: {
			meta: { description: "The server took the job: the editor closes and a toast says the new copy will appear when ready." },
		},
	},
});

const TRIM_URL = "**/api/method/photos.api.edit.trim_video*";
const holds = new WeakMap<Scene, Hold>();
const media = new WeakMap<Scene, Hold>();
const strip = (scene: Scene) => scene.page.locator(".touch-none.h-14");

async function tapStrip(scene: Scene, fraction: number) {
	const box = await strip(scene).boundingBox();
	if (!box) throw new Error("The trim strip is not on screen");
	await scene.page.touchscreen.tap(box.x + box.width * fraction, box.y + box.height / 2);
}

export const trim = defineFlow<Event>({
	id: "trim",
	title: "Trim and split a video",
	source: "frontend/src/components/VideoTrimmer.vue, frontend/src/resources/edit.ts, photos/api/edit.py (trim_video)",
	machine,
	async enter(scene) {
		const albums = await scene.call<{ name: string; title: string }[]>("photos.api.albums.albums");
		const album = albums.find((each) => each.title === "Manali road trip");
		if (!album) throw new Error("The Manali road trip album is missing");
		const page = await scene.call<{ rows: { name: string; mime_type?: string }[] }>("photos.api.albums.album_photos", { album: album.name });
		const video = page.rows.find((row) => row.mime_type?.startsWith("video/"));
		if (!video) throw new Error("The Manali road trip album has no video");
		await scene.goto(`/albums/${album.name}`);
		const target = scene.page.locator(`[data-photo="${video.name}"]`).first();
		await target.scrollIntoViewIfNeeded();
		await target.tap();
		const player = scene.page.locator("video[controls]");
		await expect(player).toBeVisible();
		await player.evaluate((element: HTMLVideoElement) => {
			element.pause();
			element.dispatchEvent(new Event("pause"));
		});
		media.set(scene, await scene.hold(new RegExp(`photos\\.api\\.media\\.content\\?entity_name=${video.name}`)));
		await scene.page.locator(".viewer-action").filter({ hasText: "Trim" }).tap();
		await expect(scene.page.getByRole("button", { name: "Save copy" })).toBeDisabled();
	},
	events: {
		async LOADS(scene) {
			await media.get(scene)?.release();
			await expect(strip(scene)).toBeVisible({ timeout: 30_000 });
			await scene.page.waitForTimeout(2_500);
		},
		async DRAG_START(scene) {
			const handle = await scene.page.getByRole("button", { name: "Start" }).boundingBox();
			const box = await strip(scene).boundingBox();
			if (!handle || !box) throw new Error("The trim handle is not on screen");
			const cdp = await scene.context.newCDPSession(scene.page);
			const y = handle.y + handle.height / 2;
			let x = handle.x + handle.width / 2;
			await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
			for (let step = 0; step < 20; step++) {
				x += (box.width * 0.25) / 20;
				await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
			}
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await cdp.detach();
			await expect(scene.page.getByRole("button", { name: "Undo" })).toBeEnabled();
		},
		async SPLIT(scene) {
			await tapStrip(scene, 0.3);
			await scene.page.getByRole("button", { name: "Split" }).tap();
			await tapStrip(scene, 0.7);
			await scene.page.getByRole("button", { name: "Split" }).tap();
			await expect(scene.page.getByRole("button", { name: "Delete part" })).toBeEnabled();
		},
		async SELECT_PART(scene) {
			await tapStrip(scene, 0.5);
			await expect(scene.page.getByRole("button", { name: "Delete part" })).toBeEnabled();
		},
		async DELETE_PART(scene) {
			await scene.page.getByRole("button", { name: "Delete part" }).tap();
			await expect(scene.page.getByRole("button", { name: "Keep part" })).toBeVisible();
		},
		async UNDO(scene) {
			await scene.page.getByRole("button", { name: "Undo" }).tap();
			await expect(scene.page.getByRole("button", { name: "Keep part" })).toHaveCount(0);
		},
		async SAVE(scene) {
			let answer!: () => void;
			const answered = new Promise<void>((resolve) => (answer = resolve));
			await scene.page.route(TRIM_URL, async (route) => {
				await answered;
				await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: null }) });
			});
			holds.set(scene, { release: async () => answer(), abort: async () => answer() });
			const sent = scene.page.waitForRequest((request) => request.url().includes("trim_video"));
			await scene.page.getByRole("button", { name: "Save copy" }).tap();
			await sent;
		},
		async SAVE_FAILS(scene) {
			const hold = await scene.hold(TRIM_URL);
			await hold.abort(417);
			await scene.page.getByRole("button", { name: "Save copy" }).tap();
			await expect(scene.page.getByText("Something went wrong")).toBeVisible({ timeout: 30_000 });
			await expect(scene.page.getByRole("button", { name: "Save copy" })).toBeVisible();
		},
		async SERVER_ANSWERS(scene) {
			await holds.get(scene)?.release();
			await expect(scene.page.getByRole("button", { name: "Save copy" })).toHaveCount(0, { timeout: 30_000 });
			await expect(scene.page.getByText(/new copy will appear/)).toBeVisible();
		},
	},
});
