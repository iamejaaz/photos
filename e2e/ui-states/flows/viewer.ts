import { expect, type Locator } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "TAP" }
	| { type: "OPEN_INFO" }
	| { type: "NEXT_SLOW" }
	| { type: "DETAILS_FAIL" }
	| { type: "OPEN_MORE" }
	| { type: "START_SLIDESHOW" }
	| { type: "FAVOURITE" }
	| { type: "DELETE" }
	| { type: "UNDO" }
	| { type: "OPEN_FROM_ALBUM" }
	| { type: "OPEN_VIDEO" };

/**
 * The full-screen viewer on a phone: chrome shown or hidden, the info sheet
 * with its details request, the more menu, favourite, trash with undo,
 * slideshow, and the album and video variants. In the code this is
 * Lightbox.vue's refs `chrome`, `lightbox.showInfo`, `lightbox.slideshow`,
 * `details`, `editing` and `confirmForever`, plus `inDrive` and `albumName`
 * deciding which buttons exist.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "viewer",
	initial: "photo",
	states: {
		photo: {
			meta: { description: "A photo opened from the timeline: back, favourite and more on top, Share, Edit, Info and Delete below." },
			on: {
				TAP: "chromeHidden",
				OPEN_INFO: "info",
				OPEN_MORE: "moreMenu",
				FAVOURITE: "favourited",
				DELETE: "trashed",
				OPEN_FROM_ALBUM: "albumPhoto",
			},
		},
		chromeHidden: {
			meta: { description: "One tap on the photo hides the top and bottom bars: just the photo on black." },
		},
		info: {
			meta: { description: "Info sheet over the lower half: caption, date, size, folder and albums, with the photo shrunk above it." },
			on: { NEXT_SLOW: "infoLoading" },
		},
		infoLoading: {
			meta: { description: "Moved to the next photo with the sheet open while its details are still loading: the sheet shows only a spinner." },
			on: { DETAILS_FAIL: "infoFailed" },
		},
		infoFailed: {
			meta: { description: "The details request failed: the sheet shows “Couldn't load details” with a Try again button instead of a spinner." },
		},
		moreMenu: {
			meta: { description: "The more menu: Slideshow, Download, Add to album, Edit and Archive." },
			on: { START_SLIDESHOW: "slideshow" },
		},
		slideshow: {
			meta: { description: "Slideshow running: no bars, a Stop slideshow pill at the bottom, the next photo every 4 seconds." },
		},
		favourited: {
			meta: { description: "Favourite tapped: the star in the top bar fills in." },
		},
		trashed: {
			meta: { description: "Delete tapped: the viewer moves to the next photo and a Moved to trash toast offers Undo for 8 seconds." },
			on: { UNDO: "restored" },
		},
		restored: {
			meta: { description: "Undo tapped: the photo is back in the viewer and a Restored toast shows, with no Undo button." },
		},
		albumPhoto: {
			meta: { description: "A photo opened from an album: the top bar adds a Like heart next to the favourite star." },
			on: { OPEN_VIDEO: "video" },
		},
		video: {
			meta: { description: "A video from the same album, paused on its poster: the native video controls and both bars stay shown, Edit becomes Trim." },
		},
	},
});

interface Target {
	name: string;
	file_name: string;
}
const targets = new WeakMap<Scene, Target>();
const holds = new WeakMap<Scene, Hold>();
const DETAILS = "**/api/method/photos.api.photos.get_details*";
const DRIVE = "suite.drive.api.files";

interface Row {
	name: string;
	file_name: string;
	mime_type?: string;
	is_favourite?: string | null;
	taken: string;
	live_video?: string | null;
	motion_photo?: number;
}

async function pickPhoto(scene: Scene): Promise<Target> {
	const page = await scene.call<{ rows: Row[] }>("photos.api.photos.timeline", { limit: 80 });
	const today = new Date().toISOString().slice(0, 10);
	const row = page.rows.find(
		(each) =>
			each.mime_type?.startsWith("image/") &&
			!each.is_favourite &&
			!each.live_video &&
			!each.motion_photo &&
			each.taken.slice(0, 10) < today,
	);
	if (!row) throw new Error("No settled photo to open in the timeline");
	return row;
}

function tile(scene: Scene, name: string): Locator {
	return scene.page.locator(`[data-photo="${name}"]`).first();
}

async function openTile(scene: Scene, name: string): Promise<void> {
	const target = tile(scene, name);
	await expect(target).toBeAttached({ timeout: 30_000 });
	await target.scrollIntoViewIfNeeded();
	await target.tap();
	await expect(scene.page.getByRole("button", { name: "Close" }).first()).toBeVisible();
}

const bottomBar = (scene: Scene) => scene.page.locator(".viewer-action");
const infoSheet = (scene: Scene) => scene.page.locator("aside");

async function expectLoaded(scene: Scene, target: Target): Promise<void> {
	await expect(scene.page.locator(`img.object-contain[alt="${target.file_name}"]`)).toBeVisible();
	await expect(bottomBar(scene).filter({ hasText: "Share" })).toBeVisible();
}

async function status(scene: Scene, name: string): Promise<string | undefined> {
	const found = await scene.call<{ status?: string } | null>("frappe.client.get_value", {
		doctype: "File",
		filters: name,
		fieldname: "status",
	});
	return found?.status;
}

export const viewer = defineFlow<Event>({
	id: "viewer",
	title: "Photo viewer",
	source: "frontend/src/components/Lightbox.vue, frontend/src/data/viewer.ts, frontend/src/data/actions.ts",
	machine,
	async enter(scene) {
		const target = await pickPhoto(scene);
		targets.set(scene, target);
		await scene.goto("/");
		await openTile(scene, target.name);
		await expectLoaded(scene, target);
	},
	events: {
		async TAP(scene) {
			const box = await scene.page.locator(`img.object-contain[alt="${targets.get(scene)?.file_name}"]`).boundingBox();
			if (!box) throw new Error("photo is not on screen");
			await scene.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
			await expect(bottomBar(scene).first()).toBeHidden();
			await expect(scene.page.getByRole("button", { name: "Close" }).first()).toBeHidden();
		},
		async OPEN_INFO(scene) {
			await bottomBar(scene).filter({ hasText: "Info" }).tap();
			await expect(infoSheet(scene).getByText("Details")).toBeVisible();
		},
		async NEXT_SLOW(scene) {
			holds.set(scene, await scene.hold(DETAILS));
			await scene.page.keyboard.press("ArrowRight");
			await expect(infoSheet(scene).getByText("Details")).toBeHidden();
			await expect(infoSheet(scene).locator("svg").first()).toBeVisible();
		},
		async DETAILS_FAIL(scene) {
			await holds.get(scene)?.abort();
			await expect(infoSheet(scene).getByText("Couldn't load details")).toBeVisible({ timeout: 30_000 });
			await expect(infoSheet(scene).getByRole("button", { name: "Try again" })).toBeVisible();
		},
		async OPEN_MORE(scene) {
			await scene.page.getByRole("button", { name: "More" }).tap();
			await expect(scene.page.getByRole("menuitem", { name: "Archive" })).toBeVisible();
		},
		async START_SLIDESHOW(scene) {
			await scene.page.getByRole("menuitem", { name: "Slideshow" }).tap();
			await expect(scene.page.getByRole("button", { name: "Stop slideshow" })).toBeVisible();
		},
		async FAVOURITE(scene) {
			const target = targets.get(scene) as Target;
			scene.defer(() =>
				scene.call(`${DRIVE}.set_favourite`, { entities: [{ name: target.name, is_favourite: "false" }] }),
			);
			const star = scene.page.locator("button.lightbox-button:not([aria-label])").locator("visible=true").first();
			const saved = scene.page.waitForResponse((response) => response.url().includes("set_favourite"));
			await star.tap();
			await saved;
			await expect(star.locator("svg.fill-current")).toBeVisible();
		},
		async DELETE(scene) {
			const target = targets.get(scene) as Target;
			scene.defer(async () => {
				if ((await status(scene, target.name)) !== "Active") {
					await scene.call(`${DRIVE}.remove_or_restore`, { entity_names: [target.name] });
				}
			});
			await bottomBar(scene).filter({ hasText: "Delete" }).tap();
			await expect(scene.page.getByText("Moved to trash")).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Undo" })).toBeVisible();
			await expect(scene.page.locator(`img.object-contain[alt="${target.file_name}"]`)).toHaveCount(0);
		},
		async UNDO(scene) {
			const target = targets.get(scene) as Target;
			const restored = scene.page.waitForResponse((response) => response.url().includes("remove_or_restore"));
			await scene.page.getByRole("button", { name: "Undo" }).tap();
			await restored;
			await expect(scene.page.locator(`img.object-contain[alt="${target.file_name}"]`)).toBeVisible();
			await expect(scene.page.getByText("Restored", { exact: true })).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Undo" })).toHaveCount(0);
		},
		async OPEN_FROM_ALBUM(scene) {
			const albums = await scene.call<{ name: string; title: string }[]>("photos.api.albums.albums");
			const album = albums.find((each) => each.title === "Manali road trip");
			if (!album) throw new Error("The Manali road trip album is missing");
			const page = await scene.call<{ rows: Row[] }>("photos.api.albums.album_photos", { album: album.name });
			const first = page.rows.find((row) => row.mime_type?.startsWith("image/")) as Row;
			const video = page.rows.find((row) => row.mime_type?.startsWith("video/"));
			if (video) targets.set(scene, video);
			await scene.goto(`/albums/${album.name}`);
			await openTile(scene, first.name);
			await expect(scene.page.locator(`img.object-contain[alt="${first.file_name}"]`)).toBeVisible();
			await expect(bottomBar(scene).filter({ hasText: "Share" })).toBeVisible();
		},
		async OPEN_VIDEO(scene) {
			const video = targets.get(scene) as Target;
			await scene.page.getByRole("button", { name: "Close" }).first().tap();
			await expect(scene.page.getByRole("button", { name: "Close" })).toHaveCount(0);
			await openTile(scene, video.name);
			const player = scene.page.locator("video[controls]");
			await expect(player).toBeVisible();
			await player.evaluate((element: HTMLVideoElement) => {
				element.pause();
				element.dispatchEvent(new Event("pause"));
			});
			await expect(bottomBar(scene).filter({ hasText: "Trim" })).toBeVisible();
		},
	},
});
