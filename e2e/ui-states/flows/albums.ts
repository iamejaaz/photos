import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "OPEN_EMPTY_LIBRARY" }
	| { type: "OPEN_NEW" }
	| { type: "TYPE_TITLE" }
	| { type: "CREATE" }
	| { type: "OPEN_ADD" }
	| { type: "PICK_THREE" }
	| { type: "ADD" }
	| { type: "OPEN_ALBUM" }
	| { type: "OPEN_MENU" }
	| { type: "OPEN_RENAME" }
	| { type: "SAVE_TITLE" }
	| { type: "OPEN_DELETE" }
	| { type: "DELETE" }
	| { type: "OPEN_ACTIVITY" }
	| { type: "COMMENT" }
	| { type: "OPEN_SLOW" }
	| { type: "ALBUM_FAILS" }
	| { type: "OPEN_MISSING" };

/**
 * Albums from the list to one album: loading, failed and empty lists, the
 * new album dialog, an empty and a filled album, adding photos, the options
 * menu with rename, delete and activity, and an album that does not load.
 * In the code the list is Albums.vue's `albumsLoaded && !list.length` check
 * over module refs in data/albums.ts; one album is Album.vue's v-if chain
 * over `gate`, `error` and `album`, plus a boolean ref per dialog.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "albums",
	initial: "listLoading",
	states: {
		listLoading: {
			meta: { description: "The albums request is still out: the header and New album, with a spinner under them." },
			on: { LOADS: "listPopulated", FAILS: "listFailed" },
		},
		listFailed: {
			meta: { description: "The albums request failed: Couldn't load albums, a line to check the connection, and Try again." },
		},
		listPopulated: {
			meta: { description: "Maya's albums as cover tiles with title and count, newest activity first, with a sort control." },
			on: {
				OPEN_EMPTY_LIBRARY: "listEmpty",
				OPEN_NEW: "newAlbumDialog",
				OPEN_ALBUM: "albumWithPhotos",
				OPEN_SLOW: "albumLoading",
				ALBUM_FAILS: "albumFailed",
				OPEN_MISSING: "albumNotFound",
			},
		},
		listEmpty: {
			meta: { description: "A new person with no albums: the empty state explains what an album is." },
		},
		newAlbumDialog: {
			meta: { description: "New album: a title field and Create." },
			on: { TYPE_TITLE: "newAlbumTyped" },
		},
		newAlbumTyped: {
			meta: { description: "The title typed in, ready to create." },
			on: { CREATE: "emptyAlbum" },
		},
		emptyAlbum: {
			meta: { description: "The album just created: its title, Add photos and Share, and the empty state pointing to Add photos." },
			on: { OPEN_ADD: "addPhotosDialog" },
		},
		addPhotosDialog: {
			meta: { description: "Add photos: the library as a grid of checkboxes, Upload, a count and a disabled Add." },
			on: { PICK_THREE: "addPhotosPicked" },
		},
		addPhotosPicked: {
			meta: { description: "Three photos ticked: the count reads 3 selected and Add is enabled." },
			on: { ADD: "photosAdded" },
		},
		photosAdded: {
			meta: { description: "After Add: the dialog closes, a toast confirms and the three photos fill the album." },
		},
		albumWithPhotos: {
			meta: { description: "An album with photos, opened from the list: the grid under the title and the album actions." },
			on: { OPEN_MENU: "albumMenu" },
		},
		albumMenu: {
			meta: { description: "The album options menu on a phone: Activity, Slideshow, Download, Rename, Auto-add people, Link settings, Delete." },
			on: { OPEN_RENAME: "renameDialog", OPEN_DELETE: "deleteDialog", OPEN_ACTIVITY: "activityEmpty" },
		},
		renameDialog: {
			meta: { description: "Rename album with the current title filled in." },
			on: { SAVE_TITLE: "renamed" },
		},
		renamed: {
			meta: { description: "After Save: the header shows the new title." },
		},
		deleteDialog: {
			meta: { description: "Delete album? with what happens to shares and photos, and the option to trash the photos too." },
			on: { DELETE: "deleted" },
		},
		deleted: {
			meta: { description: "After Delete: back on Albums and the album is gone from the list." },
		},
		activityEmpty: {
			meta: { description: "The activity panel over the album with no comments yet and the comment box." },
			on: { COMMENT: "activityWithComment" },
		},
		activityWithComment: {
			meta: { description: "A comment posted: it shows with Maya's name and time." },
		},
		albumLoading: {
			meta: { description: "The album request is still out: a spinner under a header with no title and no actions yet." },
		},
		albumFailed: {
			meta: { description: "The album request failed with a server error: Couldn't load this album, with Try again." },
		},
		albumNotFound: {
			meta: { description: "An album link that does not exist: This link is no longer available, with Go to albums." },
		},
	},
});

const holds = new WeakMap<Scene, Hold>();
const seeded = new WeakMap<Scene, { name: string; title: string }>();
const LIST = "**/api/method/photos.api.albums.albums";
const GET_ALBUM = "**/api/method/photos.api.albums.get_album";

interface Row {
	name: string;
	mime_type: string | null;
	file_name: string;
	creation: string;
}

async function libraryPhotos(scene: Scene, count: number): Promise<string[]> {
	const { rows } = await scene.call<{ rows: Row[] }>("photos.api.photos.timeline", { start: 0 });
	const today = new Date().toISOString().slice(0, 10);
	const stable = rows.filter(
		(row) => row.mime_type?.startsWith("image/") && row.creation.slice(0, 10) < today && !/^Collage|^Movie/.test(row.file_name),
	);
	const picked = (stable.length >= count ? stable : rows).slice(0, count).map((row) => row.name);
	if (picked.length < count) throw new Error("albums: the actor's library has too few photos");
	return picked;
}

async function deleteIfThere(scene: Scene, album: string): Promise<void> {
	await scene.call("photos.api.albums.delete_album", { album }).catch((error: Error) => {
		if (!error.message.includes(" 403 ")) throw error;
	});
}

async function createAlbum(scene: Scene, title: string, files: string[]): Promise<string> {
	const name = await scene.call<string>("photos.api.albums.create_album", { title, files });
	scene.defer(() => deleteIfThere(scene, name));
	return name;
}

function tile(scene: Scene, title: string) {
	return scene.page.getByRole("link", { name: new RegExp(title) });
}

async function openSeeded(scene: Scene): Promise<void> {
	const album = seeded.get(scene);
	if (!album) throw new Error("albums: nothing seeded");
	await tile(scene, album.title).tap();
	await expect(scene.page.getByRole("heading", { name: album.title })).toBeVisible();
}

async function menuItem(scene: Scene, label: string): Promise<void> {
	await scene.page.getByRole("menuitem", { name: label }).tap();
}

export const albums = defineFlow<Event>({
	id: "albums",
	title: "Albums",
	source: "frontend/src/pages/Albums.vue, frontend/src/pages/Album.vue, frontend/src/data/albums.ts, frontend/src/components/AddPhotosDialog.vue, frontend/src/components/ActivityPanel.vue",
	machine,
	async enter(scene) {
		const title = scene.name("Goa trip");
		const name = await createAlbum(scene, title, await libraryPhotos(scene, 6));
		seeded.set(scene, { name, title });
		holds.set(scene, await scene.hold(LIST));
		await scene.goto("/albums");
	},
	settle: {
		async listLoading(scene) {
			await expect(scene.page.getByRole("button", { name: "New album" })).toBeVisible();
		},
		async listFailed(scene) {
			await expect(scene.page.getByRole("button", { name: "New album" })).toBeVisible();
		},
		async addPhotosDialog(scene) {
			await scene.page.waitForFunction(() =>
				Array.from(document.querySelectorAll<HTMLImageElement>("[role=dialog] img")).slice(0, 20).every((img) => img.complete),
			);
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			const album = seeded.get(scene);
			await expect(tile(scene, album?.title ?? "")).toBeVisible();
			await expect(scene.page.locator("img[src*='thumbnail']").first()).toBeVisible();
		},
		async FAILS(scene) {
			await holds.get(scene)?.abort();
			await expect(scene.page.getByText("Couldn't load albums")).toBeVisible({ timeout: 30_000 });
			await expect(scene.page.getByRole("button", { name: "Try again" })).toBeVisible();
		},
		async OPEN_EMPTY_LIBRARY(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/albums");
			await expect(scene.page.getByText("No albums yet")).toBeVisible();
		},
		async OPEN_NEW(scene) {
			await scene.page.getByRole("button", { name: "New album" }).tap();
			await expect(scene.page.getByRole("dialog").getByPlaceholder("Album title")).toBeVisible();
		},
		async TYPE_TITLE(scene) {
			await scene.page.getByPlaceholder("Album title").fill(scene.name("Lisbon weekend"));
		},
		async CREATE(scene) {
			await scene.page.getByRole("dialog").getByRole("button", { name: "Create" }).tap();
			await scene.page.waitForURL(/\/photos\/albums\/[^/]+$/);
			const name = decodeURIComponent(new URL(scene.page.url()).pathname.split("/").pop() ?? "");
			scene.defer(() => deleteIfThere(scene, name));
			await expect(scene.page.getByText("This album is empty")).toBeVisible();
		},
		async OPEN_ADD(scene) {
			await scene.page.getByRole("button", { name: "Add photos" }).tap();
			const dialog = scene.page.getByRole("dialog");
			await expect(dialog.getByText("0 selected")).toBeVisible();
			await expect(dialog.locator("img[src*='thumbnail']").nth(8)).toBeVisible();
		},
		async PICK_THREE(scene) {
			const dialog = scene.page.getByRole("dialog");
			const stable = await libraryPhotos(scene, 3);
			for (const name of stable) await dialog.locator(`button:has(img[src*='entity_name=${name}'])`).first().tap();
			await expect(dialog.getByText("3 selected")).toBeVisible();
		},
		async ADD(scene) {
			await scene.page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).tap();
			await expect(scene.page.getByRole("dialog")).toHaveCount(0);
			await expect(scene.page.getByText(/^Added to /)).toBeVisible();
			await expect(scene.page.locator("img[src*='thumbnail']").nth(2)).toBeVisible();
		},
		async OPEN_ALBUM(scene) {
			await openSeeded(scene);
			await expect(scene.page.locator("img[src*='thumbnail']").nth(5)).toBeVisible();
		},
		async OPEN_MENU(scene) {
			await scene.page.getByRole("button", { name: "Album options" }).tap();
			await expect(scene.page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
		},
		async OPEN_RENAME(scene) {
			await menuItem(scene, "Rename");
			await expect(scene.page.getByRole("dialog").getByRole("textbox")).toHaveValue(seeded.get(scene)?.title ?? "");
		},
		async SAVE_TITLE(scene) {
			const title = scene.name("Goa trip, Palolem beach");
			await scene.page.getByRole("dialog").getByRole("textbox").fill(title);
			await scene.page.getByRole("dialog").getByRole("button", { name: "Save" }).tap();
			await expect(scene.page.getByRole("dialog")).toHaveCount(0);
			await expect(scene.page.getByRole("heading", { name: title })).toBeVisible();
		},
		async OPEN_DELETE(scene) {
			await menuItem(scene, "Delete album");
			await expect(scene.page.getByText("Also move the photos to trash")).toBeVisible();
		},
		async DELETE(scene) {
			await scene.page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).tap();
			await scene.page.waitForURL(/\/photos\/albums$/);
			await expect(scene.page.getByRole("button", { name: "New album" })).toBeVisible();
			await expect(scene.page.locator("img[src*='thumbnail']").first()).toBeVisible();
			await expect(tile(scene, seeded.get(scene)?.title ?? "")).toHaveCount(0);
		},
		async OPEN_ACTIVITY(scene) {
			await menuItem(scene, "Activity");
			await expect(scene.page.getByText("No comments yet. Say something about these photos.")).toBeVisible();
		},
		async COMMENT(scene) {
			const text = "The sunset at Palolem was the best evening of the trip.";
			await scene.page.getByPlaceholder("Add a comment").fill(text);
			await scene.page.getByPlaceholder("Add a comment").press("Enter");
			await expect(scene.page.locator("aside").getByText(text)).toBeVisible();
			await expect(scene.page.getByPlaceholder("Add a comment")).toHaveValue("");
		},
		async OPEN_SLOW(scene) {
			holds.set(scene, await scene.hold(GET_ALBUM));
			const album = seeded.get(scene);
			await tile(scene, album?.title ?? "").tap();
			await scene.page.waitForURL(/\/photos\/albums\/[^/]+$/);
			await expect(scene.page.getByRole("button", { name: "Album options" })).toHaveCount(0);
			await expect(scene.page.locator("svg.fui-spinner").first()).toBeVisible();
		},
		async ALBUM_FAILS(scene) {
			const hold = await scene.hold(GET_ALBUM);
			await hold.abort();
			await tile(scene, seeded.get(scene)?.title ?? "").tap();
			await expect(scene.page.getByText("Couldn't load this album")).toBeVisible({ timeout: 30_000 });
			await expect(scene.page.getByRole("button", { name: "Try again" })).toBeVisible();
		},
		async OPEN_MISSING(scene) {
			await scene.goto("/albums/0000000000");
			await expect(scene.page.getByText("This link is no longer available")).toBeVisible();
		},
	},
});
