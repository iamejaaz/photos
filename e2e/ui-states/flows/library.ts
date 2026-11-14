import { expect, type Route } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "OPEN_AS_NEW_PERSON" }
	| { type: "OPEN_FAVOURITES" }
	| { type: "OPEN_ARCHIVE" }
	| { type: "OPEN_HIDDEN" }
	| { type: "OPEN_RECENT" }
	| { type: "OPEN_DUPLICATES" }
	| { type: "OPEN_FOLDERS" }
	| { type: "OPEN_FOLDER" }
	| { type: "HOLD_FAVOURITES" }
	| { type: "HOLD_DUPLICATES" }
	| { type: "HOLD_FOLDERS" }
	| { type: "HOLD_HIDDEN" }
	| { type: "FAILS" }
	| { type: "WRONG_PASSWORD" }
	| { type: "ASK_FOR_CODE" }
	| { type: "UNLOCK" };

/**
 * The Library tab and the collections it links to. Each page decides its own
 * screen: Collection.vue and Recent.vue go through PhotoGrid.vue's loading /
 * empty / error chain; Duplicates.vue has its own `loading` ref and `groups`;
 * Folders.vue has only `loaded`; Hidden.vue decides from `unlocked`
 * (null | false | true) and `codeSentTo`. Albums on the hub come from
 * data/albums.ts `albumsLoaded`.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "library",
	initial: "hub",
	states: {
		hub: {
			meta: { description: "The Library tab: shortcut tiles to every collection, the first albums, and account rows." },
			on: {
				OPEN_FAVOURITES: "favourites",
				OPEN_ARCHIVE: "archive",
				OPEN_HIDDEN: "hiddenLocked",
				OPEN_RECENT: "recent",
				OPEN_DUPLICATES: "duplicates",
				OPEN_FOLDERS: "folders",
				HOLD_FAVOURITES: "favouritesLoading",
				HOLD_DUPLICATES: "duplicatesLoading",
				HOLD_FOLDERS: "foldersLoading",
				HOLD_HIDDEN: "hiddenChecking",
				OPEN_AS_NEW_PERSON: "hubNew",
			},
		},
		hubNew: {
			meta: { description: "The Library tab for a person with no albums: the shortcuts and only the New album tile." },
			on: {
				OPEN_FAVOURITES: "favouritesEmpty",
				OPEN_ARCHIVE: "archiveEmpty",
				OPEN_RECENT: "recentEmpty",
				OPEN_DUPLICATES: "duplicatesEmpty",
				OPEN_FOLDERS: "foldersEmpty",
				OPEN_HIDDEN: "hiddenLockedNew",
			},
		},
		favourites: {
			meta: { description: "Favourites: starred photos and videos grouped by day, each tile with a star." },
		},
		favouritesLoading: {
			meta: { description: "Favourites still loading: the header and a spinner." },
			on: { FAILS: "favouritesFailed" },
		},
		favouritesFailed: {
			meta: { description: "Favourites failed to load: Couldn't load this, a line to check the connection, and Try again, with no empty state." },
		},
		favouritesEmpty: {
			meta: { description: "No favourites yet: the star icon and how to add one." },
		},
		archive: {
			meta: { description: "Archive with one archived photo: the grid that keeps photos out of the timeline." },
		},
		archiveEmpty: {
			meta: { description: "Nothing archived: the empty state explains what archive does." },
		},
		hiddenChecking: {
			meta: { description: "Hidden while the lock check is out: only the header, no form, spinner or text." },
			on: { FAILS: "hiddenCheckFailed" },
		},
		hiddenCheckFailed: {
			meta: { description: "The lock check failed: Couldn't load this with Try again under the header." },
		},
		hiddenLocked: {
			meta: { description: "Hidden is locked on the web: password field, Unlock and Email me a code." },
			on: { WRONG_PASSWORD: "hiddenWrongPassword", ASK_FOR_CODE: "hiddenCodeEntry", UNLOCK: "hiddenUnlocked" },
		},
		hiddenLockedNew: {
			meta: { description: "A person with nothing hidden still gets the password lock first." },
			on: { UNLOCK: "hiddenEmpty" },
		},
		hiddenWrongPassword: {
			meta: { description: "A wrong password: the server's error under the field (response shaped, no real password sent)." },
		},
		hiddenCodeEntry: {
			meta: { description: "Email me a code sent: the 6 digit code field, Send a new code and Use password instead (response shaped, no email sent)." },
		},
		hiddenUnlocked: {
			meta: { description: "Hidden unlocked: the explainer line, the hidden grid and a Lock button (lock check and rows shaped from library photos)." },
		},
		hiddenEmpty: {
			meta: { description: "Hidden unlocked with nothing in it: 'Nothing hidden' and how to hide photos (lock check shaped)." },
		},
		recent: {
			meta: { description: "Recently added: photos grouped by the day they were added, newest first." },
		},
		recentEmpty: {
			meta: { description: "Nothing added yet: the empty state for a new library." },
		},
		duplicates: {
			meta: { description: "Duplicate groups with the best copy badged, extras pre-ticked, and Keep best, trash N in the header." },
		},
		duplicatesLoading: {
			meta: { description: "Duplicates still scanning: the header and a spinner." },
			on: { FAILS: "duplicatesFailed" },
		},
		duplicatesFailed: {
			meta: { description: "The duplicates scan failed: Couldn't load this with Try again instead of the spinner." },
		},
		duplicatesEmpty: {
			meta: { description: "No duplicates found: the empty state." },
		},
		folders: {
			meta: { description: "Drive folders that hold photos, each with a cover, owner and count." },
			on: { OPEN_FOLDER: "folderPage" },
		},
		foldersLoading: {
			meta: { description: "Folders still loading: the intro line and a spinner under it." },
			on: { FAILS: "foldersFailed" },
		},
		foldersFailed: {
			meta: { description: "Folders failed to load: the intro line, then Couldn't load this with Try again." },
		},
		foldersEmpty: {
			meta: { description: "No Drive folders with photos yet." },
		},
		folderPage: {
			meta: { description: "One folder opened: Folders > folder name in the header, and its photos grouped by day." },
		},
	},
});

const PHOTOS = "**/api/method/photos.api.photos";
const HIDDEN = "**/api/method/photos.api.hidden";
/** Photos this flow changes and puts back; old ones, so flows that use the newest tiles keep theirs. */
const FAVOURITE = "60bf7afe06";
const ARCHIVED = "8c4a87796a";
const holds = new WeakMap<Scene, Hold>();

interface Page {
	rows: { name: string; is_favourite?: string | null }[];
	next_start: number;
	has_next: boolean;
}

const fresh = (scene: Scene) => scene.role === "fresh";
const tiles = (scene: Scene) => scene.page.locator("[data-photo]");

async function tap(scene: Scene, label: string): Promise<void> {
	await scene.page.getByRole("link", { name: label, exact: true }).first().click();
}

async function hold(scene: Scene, url: string, label: string): Promise<void> {
	holds.set(scene, await scene.hold(url));
	await tap(scene, label);
}

function fulfil(route: Route, message: unknown): Promise<void> {
	return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message }) });
}

async function ensureFavourite(scene: Scene): Promise<void> {
	const page = await scene.call<Page>("photos.api.photos.favourites", { limit: 500 });
	if (page.rows.some((row) => row.name === FAVOURITE)) return;
	const set = (value: boolean) =>
		scene.call("suite.drive.api.files.set_favourite", {
			entities: [{ name: FAVOURITE, is_favourite: JSON.stringify(value) }],
		});
	await set(true);
	scene.defer(() => set(false));
}

async function ensureArchived(scene: Scene): Promise<void> {
	const page = await scene.call<Page>("photos.api.photos.archived", { limit: 500 });
	if (page.rows.some((row) => row.name === ARCHIVED)) return;
	await scene.call("photos.api.photos.set_archived", { files: [ARCHIVED], archived: true });
	scene.defer(() => scene.call("photos.api.photos.set_archived", { files: [ARCHIVED], archived: false }));
}

/** Hidden can only be unlocked with the account password, so the lock check and the rows are shaped. */
async function shapeUnlocked(scene: Scene, rows: Page["rows"]): Promise<void> {
	await scene.page.route(`${HIDDEN}.hidden_state*`, (route) => fulfil(route, { unlocked: true, count: rows.length }));
	await scene.page.route(`${HIDDEN}.hidden_photos*`, (route) =>
		fulfil(route, { rows, next_start: rows.length, has_next: false }),
	);
	await scene.page.reload();
}

export const library = defineFlow<Event>({
	id: "library",
	title: "Library collections",
	source:
		"frontend/src/pages/Library.vue, Collection.vue (favourites, archive), Hidden.vue, Recent.vue, Duplicates.vue, Folders.vue, FolderPage.vue, frontend/src/components/PhotoGrid.vue",
	machine,
	async enter(scene) {
		await scene.goto("/library");
		await expect(scene.page.getByText("New album")).toBeVisible();
	},
	events: {
		async OPEN_AS_NEW_PERSON(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/library");
			await expect(scene.page.getByText("New album")).toBeVisible();
		},
		async OPEN_FAVOURITES(scene) {
			if (!fresh(scene)) await ensureFavourite(scene);
			await tap(scene, "Favourites");
			if (fresh(scene)) await expect(scene.page.getByText("No favourites yet")).toBeVisible();
			else await expect(tiles(scene).first()).toBeVisible();
		},
		async OPEN_ARCHIVE(scene) {
			if (!fresh(scene)) await ensureArchived(scene);
			await tap(scene, "Archive");
			if (fresh(scene)) await expect(scene.page.getByText("Nothing archived")).toBeVisible();
			else await expect(scene.page.locator(`[data-photo="${ARCHIVED}"]`)).toBeVisible();
		},
		async OPEN_HIDDEN(scene) {
			await tap(scene, "Hidden");
			await expect(scene.page.getByText("Hidden photos are locked")).toBeVisible();
		},
		async OPEN_RECENT(scene) {
			await tap(scene, "Recently added");
			if (fresh(scene)) await expect(scene.page.getByText("Nothing added yet")).toBeVisible();
			else await expect(tiles(scene).first()).toBeVisible();
		},
		async OPEN_DUPLICATES(scene) {
			await tap(scene, "Duplicates");
			if (fresh(scene)) await expect(scene.page.getByText("No duplicates found")).toBeVisible();
			else await expect(scene.page.getByText("Best quality").first()).toBeVisible({ timeout: 30_000 });
		},
		async OPEN_FOLDERS(scene) {
			await tap(scene, "Folders");
			if (fresh(scene)) await expect(scene.page.getByText("No Drive folders with photos yet.")).toBeVisible();
			else await expect(scene.page.locator("a[href*='/folders/'] img").first()).toBeVisible();
		},
		async OPEN_FOLDER(scene) {
			await scene.page.locator("a[href*='/folders/']").first().click();
			await expect(scene.page.getByRole("link", { name: "Folders", exact: true })).toBeVisible();
			await expect(tiles(scene).first()).toBeVisible();
		},
		async HOLD_FAVOURITES(scene) {
			await hold(scene, `${PHOTOS}.favourites*`, "Favourites");
			await expect(scene.page.getByRole("heading", { name: "Favourites" })).toBeVisible();
		},
		async HOLD_DUPLICATES(scene) {
			await hold(scene, `${PHOTOS}.duplicates*`, "Duplicates");
			await expect(scene.page.getByRole("heading", { name: "Duplicates" })).toBeVisible();
		},
		async HOLD_FOLDERS(scene) {
			await hold(scene, `${PHOTOS}.folders*`, "Folders");
			await expect(scene.page.getByText("Drive folders that have photos")).toBeVisible();
		},
		async HOLD_HIDDEN(scene) {
			await hold(scene, `${HIDDEN}.hidden_state*`, "Hidden");
			await expect(scene.page.getByRole("heading", { name: "Hidden" })).toBeVisible();
		},
		async FAILS(scene) {
			const failed = scene.page.waitForResponse((response) => response.status() >= 500);
			await holds.get(scene)?.abort();
			await failed;
			await expect(scene.page.getByText("Couldn't load this")).toBeVisible({ timeout: 30_000 });
			await expect(scene.page.getByRole("button", { name: "Try again" })).toBeVisible();
		},
		async WRONG_PASSWORD(scene) {
			await scene.page.route(`${HIDDEN}.unlock`, (route) =>
				route.fulfill({
					status: 401,
					contentType: "application/json",
					body: JSON.stringify({
						exc_type: "AuthenticationError",
						_server_messages: JSON.stringify([JSON.stringify({ message: "Incorrect User or Password" })]),
					}),
				}),
			);
			await scene.page.getByLabel("Password").fill("not-the-password");
			await scene.page.getByRole("button", { name: "Unlock" }).click();
			await expect(scene.page.getByText(/Incorrect|not right/).first()).toBeVisible();
		},
		async ASK_FOR_CODE(scene) {
			await scene.page.route(`${HIDDEN}.email_unlock_code*`, (route) => fulfil(route, { email: "demo@example.com" }));
			await scene.page.getByRole("button", { name: "Email me a code" }).click();
			await expect(scene.page.getByText(/Enter the 6 digit code/)).toBeVisible();
		},
		async UNLOCK(scene) {
			if (fresh(scene)) {
				await shapeUnlocked(scene, []);
				await expect(scene.page.getByText("Nothing hidden")).toBeVisible();
				return;
			}
			const page = await scene.call<Page>("photos.api.photos.timeline", { limit: 9 });
			await shapeUnlocked(scene, page.rows);
			await expect(tiles(scene).first()).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Lock" })).toBeVisible();
		},
	},
});
