import { expect, type Locator } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "RELOAD" }
	| { type: "OPEN_NEW_PERSON" }
	| { type: "ASK_EMPTY_TRASH" }
	| { type: "CANCEL_EMPTY_TRASH" }
	| { type: "SELECT_ONE" }
	| { type: "ASK_DELETE_SELECTED" }
	| { type: "CANCEL_DELETE_SELECTED" }
	| { type: "RESTORE_SELECTED" }
	| { type: "RESTORE_FAILS" }
	| { type: "OPEN_PHOTO" }
	| { type: "ASK_DELETE_PHOTO" }
	| { type: "CANCEL_DELETE_PHOTO" }
	| { type: "RESTORE_PHOTO" };

/**
 * Trash: the trashed-items grid with its days-left badges, the Empty trash
 * and Delete forever confirms, the selection bar (Restore, Delete forever)
 * and the viewer's own Restore / Delete forever bar. In the code this is
 * Collection.vue with kind 'trash' (the `confirmEmpty` and `emptying` refs),
 * PhotoGrid.vue's loading / empty / error chain over the feed, PhotosHeader's
 * `mode === 'trash'` action list and `confirmDelete`, and Lightbox.vue's
 * `trashed` computed with `confirmForever`.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "trash",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "The trash request is still out: the Trash header and a spinner, no tiles and no Empty trash button yet." },
			on: { LOADS: "populated", FAILS: "failed" },
		},
		failed: {
			meta: { description: "The trash request failed: the server's error under an empty page, with no retry control." },
			on: { RELOAD: "populated" },
		},
		populated: {
			meta: { description: "Trashed photos and videos with a days-left badge on each tile, and Empty trash in the header." },
			on: {
				ASK_EMPTY_TRASH: "emptyTrashConfirm",
				SELECT_ONE: "selecting",
				OPEN_PHOTO: "viewer",
				OPEN_NEW_PERSON: "empty",
			},
		},
		empty: {
			meta: { description: "A person with nothing in trash: the empty state explains the 30 day rule, and Empty trash is gone." },
		},
		emptyTrashConfirm: {
			meta: { description: "Empty trash tapped: the red confirm warns that everything in trash is deleted forever. Cancelled in the next step." },
			on: { CANCEL_EMPTY_TRASH: "populated" },
		},
		selecting: {
			meta: { description: "One trashed photo picked: the header turns into the selection bar with only Restore and Delete forever." },
			on: {
				ASK_DELETE_SELECTED: "deleteSelectedConfirm",
				RESTORE_SELECTED: "restored",
				RESTORE_FAILS: "restoreFailed",
			},
		},
		deleteSelectedConfirm: {
			meta: { description: "Delete forever from the selection bar: the red confirm for the picked items. Cancelled in the next step." },
			on: { CANCEL_DELETE_SELECTED: "selecting" },
		},
		restored: {
			meta: { description: "Restore tapped: the photo leaves the trash grid, the selection clears and a Restored toast shows (no Undo)." },
		},
		restoreFailed: {
			meta: {
				description:
					"Restore fails on the server: no toast or error shows, the photo stays in trash and the selection bar stays up, so the tap looks ignored.",
			},
		},
		viewer: {
			meta: { description: "A trashed photo opened: the viewer's bottom bar trades Share, Edit and Delete for Restore and Delete forever." },
			on: { ASK_DELETE_PHOTO: "deletePhotoConfirm", RESTORE_PHOTO: "viewerRestored" },
		},
		deletePhotoConfirm: {
			meta: { description: "Delete forever from the viewer: the red confirm over the photo. Cancelled in the next step." },
			on: { CANCEL_DELETE_PHOTO: "viewer" },
		},
		viewerRestored: {
			meta: { description: "Restore from the viewer: the Restored toast shows and the viewer moves on to the next trashed item." },
		},
	},
});

/** The oldest photo in the actor's library, so other flows that use the newest tiles do not lose it. */
const SEED = { name: "316aab74a1", file: "IMG_0002.JPG" };
const TRASH = "**/api/method/photos.api.photos.trash*";
const TOGGLE = "**/api/method/suite.drive.api.files.remove_or_restore*";
const holds = new WeakMap<Scene, Hold>();

async function inTrash(scene: Scene, name: string): Promise<boolean> {
	const page = await scene.call<{ rows: { name: string }[] }>("photos.api.photos.trash", { limit: 500 });
	return page.rows.some((row) => row.name === name);
}

/** Moves the seed photo to trash once, and restores it on close only if it is still there (the call toggles). */
async function seedTrash(scene: Scene): Promise<void> {
	if (!(await inTrash(scene, SEED.name))) {
		await scene.call("suite.drive.api.files.remove_or_restore", { entity_names: [SEED.name] });
	}
	scene.defer(async () => {
		if (await inTrash(scene, SEED.name)) {
			await scene.call("suite.drive.api.files.remove_or_restore", { entity_names: [SEED.name] });
		}
	});
}

const tile = (scene: Scene) => scene.page.locator(`[data-photo="${SEED.name}"]`);
const dialog = (scene: Scene, title: string) => scene.page.getByRole("dialog").filter({ hasText: title });
const viewerAction = (scene: Scene, label: string) => scene.page.locator(".viewer-action", { hasText: label });

async function closeDialog(scene: Scene, title: string): Promise<void> {
	const open = dialog(scene, title);
	await open.getByRole("button", { name: /close/i }).first().click();
	await expect(open).toHaveCount(0);
}

async function selectionButton(scene: Scene, label: string): Promise<Locator> {
	const button = scene.page.getByRole("button", { name: label, exact: true }).first();
	await expect(button).toBeVisible();
	return button;
}

export const trash = defineFlow<Event>({
	id: "trash",
	title: "Trash",
	source:
		"frontend/src/pages/Collection.vue (kind 'trash'), frontend/src/components/PhotoGrid.vue, frontend/src/components/PhotosHeader.vue, frontend/src/components/Lightbox.vue, frontend/src/data/actions.ts",
	machine,
	async enter(scene) {
		await seedTrash(scene);
		holds.set(scene, await scene.hold(TRASH));
		await scene.goto("/trash");
	},
	settle: {
		async loading(scene) {
			await expect(scene.page.getByRole("heading", { name: "Trash" })).toBeVisible();
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			await expect(tile(scene)).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Empty trash" })).toBeVisible();
		},
		async FAILS(scene) {
			await holds.get(scene)?.abort();
			await expect(scene.page.getByText("Something went wrong").first()).toBeVisible({ timeout: 30_000 });
		},
		async RELOAD(scene) {
			await holds.get(scene)?.release();
			await scene.page.reload();
			await expect(tile(scene)).toBeVisible();
		},
		async OPEN_NEW_PERSON(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/trash");
			await expect(scene.page.getByText("Trash is empty")).toBeVisible();
		},
		async ASK_EMPTY_TRASH(scene) {
			await scene.page.getByRole("button", { name: "Empty trash" }).click();
			await expect(dialog(scene, "Empty trash?")).toBeVisible();
		},
		async CANCEL_EMPTY_TRASH(scene) {
			await closeDialog(scene, "Empty trash?");
			await expect(tile(scene)).toBeVisible();
		},
		async SELECT_ONE(scene) {
			await scene.longPress(tile(scene));
			await expect(scene.page.getByText("1 selected")).toBeVisible();
		},
		async ASK_DELETE_SELECTED(scene) {
			await (await selectionButton(scene, "Delete forever")).click();
			await expect(dialog(scene, "Delete forever?")).toBeVisible();
		},
		async CANCEL_DELETE_SELECTED(scene) {
			await closeDialog(scene, "Delete forever?");
			await expect(scene.page.getByText("1 selected")).toBeVisible();
		},
		async RESTORE_SELECTED(scene) {
			await (await selectionButton(scene, "Restore")).click();
			await expect(scene.page.getByText("Restored", { exact: true })).toBeVisible();
			await expect(tile(scene)).toHaveCount(0);
		},
		async RESTORE_FAILS(scene) {
			const hold = await scene.hold(TOGGLE);
			await hold.abort();
			const failed = scene.page.waitForResponse((response) => response.url().includes("remove_or_restore"));
			await (await selectionButton(scene, "Restore")).click();
			await failed;
			await scene.settle(1500);
			await expect(scene.page.getByText("1 selected")).toBeVisible();
			await expect(tile(scene)).toBeVisible();
		},
		async OPEN_PHOTO(scene) {
			await tile(scene).click();
			await expect(viewerAction(scene, "Restore")).toBeVisible();
			await expect(viewerAction(scene, "Delete forever")).toBeVisible();
		},
		async ASK_DELETE_PHOTO(scene) {
			await viewerAction(scene, "Delete forever").click();
			await expect(dialog(scene, "Delete forever?")).toBeVisible();
		},
		async CANCEL_DELETE_PHOTO(scene) {
			await closeDialog(scene, "Delete forever?");
			await expect(viewerAction(scene, "Restore")).toBeVisible();
		},
		async RESTORE_PHOTO(scene) {
			await viewerAction(scene, "Restore").click();
			await expect(scene.page.getByText("Restored", { exact: true })).toBeVisible();
		},
	},
});
