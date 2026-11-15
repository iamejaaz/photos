import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "OPEN_MORE" }
	| { type: "CHOOSE_MOVIE" }
	| { type: "TYPE_TITLE" }
	| { type: "CREATE" }
	| { type: "CREATE_FAILS" }
	| { type: "SERVER_ANSWERS" }
	| { type: "WORKER_FINISHES" }
	| { type: "WORKER_FAILS" }
	| { type: "OPEN_MOVIE" };

/**
 * Making a movie from picked photos: the selection bar's More menu, the
 * Create movie dialog, then the progress panel that follows the background
 * job through realtime events until the movie is ready. In the code this is
 * PhotosHeader.vue's `movie` action, MovieDialog.vue (`saving`), the
 * `movies` store in data/movies.ts and MovieProgress.vue, fed by the
 * `photos-movie-*` events PhotosLayout.vue listens to.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "movie",
	initial: "selecting",
	states: {
		selecting: {
			meta: { description: "Three photos picked on the timeline: the selection bar with its actions and the More button." },
			on: { OPEN_MORE: "moreMenu" },
		},
		moreMenu: {
			meta: { description: "More opened: the overflow actions, with Create movie among them." },
			on: { CHOOSE_MOVIE: "dialog" },
		},
		dialog: {
			meta: { description: "The Create movie dialog: how many photos go in, an empty title (Movie is the placeholder) and how long each photo shows." },
			on: { TYPE_TITLE: "dialogFilled" },
		},
		dialogFilled: {
			meta: { description: "A title typed in, ready to create." },
			on: { CREATE: "creating", CREATE_FAILS: "createFailed" },
		},
		creating: {
			meta: { description: "Create tapped and the request is still out: the button spins and the dialog stays open." },
			on: { SERVER_ANSWERS: "running" },
		},
		createFailed: {
			meta: { description: "The server refused to start the movie: an error toast with the reason, and the dialog stays open to try again." },
		},
		running: {
			meta: { description: "The job is queued: the dialog closes, the selection clears and the progress panel shows the title, a bar, the photo count and the time left once known." },
			on: { WORKER_FINISHES: "ready", WORKER_FAILS: "failed" },
		},
		failed: {
			meta: {
				description:
					"The worker could not make the movie, or sent nothing for 10 minutes: “Couldn't make …” with a close button. Not captured: only a failing render job on the server shows it.",
				transient: true,
			},
		},
		ready: {
			meta: { description: "The movie is saved: “… is ready” with Open and close buttons." },
			on: { OPEN_MOVIE: "opened" },
		},
		opened: {
			meta: { description: "Open tapped: the panel closes and the timeline shows the new movie at the top." },
		},
	},
});

const CREATE_URL = "**/api/method/photos.api.movies.create_movie*";
const holds = new WeakMap<Scene, Hold>();
const panel = (scene: Scene) => scene.page.getByRole("status").filter({ hasText: scene.name("Beach days") });
const dialog = (scene: Scene) => scene.page.getByRole("dialog").filter({ hasText: "Create movie" });

const requested = new WeakSet<Scene>();

/** Deletes the movie this path made, waiting for the job when the path ended before it finished. */
async function removeMovie(scene: Scene): Promise<void> {
	for (let attempt = 0; attempt < 60; attempt++) {
		const page = await scene.call<{ rows: { name: string; file_name: string }[] }>("photos.api.photos.timeline", { limit: 20 });
		const names = page.rows.filter((row) => row.file_name.startsWith(scene.name("Beach days"))).map((row) => row.name);
		if (names.length) return void (await scene.call("suite.drive.api.files.delete_entities", { entity_names: names }));
		if (!requested.has(scene)) return;
		await scene.page.waitForTimeout(2_000);
	}
}

export const movie = defineFlow<Event>({
	id: "movie",
	title: "Movie",
	source:
		"frontend/src/components/PhotosHeader.vue (movie action), frontend/src/components/MovieDialog.vue, frontend/src/data/movies.ts, frontend/src/components/MovieProgress.vue, frontend/src/pages/PhotosLayout.vue",
	machine,
	async enter(scene) {
		scene.defer(() => removeMovie(scene));
		await scene.goto("/");
		const tiles = scene.page.locator("[data-photo]").filter({ hasNot: scene.page.getByText(/^\d+:\d\d$/) });
		await expect(tiles.first()).toBeVisible();
		await scene.longPress(tiles.nth(0));
		await tiles.nth(1).tap();
		await tiles.nth(2).tap();
		await expect(scene.page.getByText(/3 selected/).first()).toBeVisible();
	},
	events: {
		async OPEN_MORE(scene) {
			await scene.page.getByRole("button", { name: "More" }).first().tap();
			await expect(scene.page.getByRole("menuitem", { name: "Create movie" })).toBeVisible();
		},
		async CHOOSE_MOVIE(scene) {
			await scene.page.getByRole("menuitem", { name: "Create movie" }).tap();
			await expect(dialog(scene)).toBeVisible();
			await expect(dialog(scene).getByText("3 photos")).toBeVisible();
		},
		async TYPE_TITLE(scene) {
			await dialog(scene).getByLabel("Title").fill(scene.name("Beach days"));
		},
		async CREATE(scene) {
			holds.set(scene, await scene.hold(CREATE_URL));
			const sent = scene.page.waitForRequest((request) => request.url().includes("create_movie"));
			await dialog(scene).getByRole("button", { name: "Create" }).tap();
			await sent;
		},
		async CREATE_FAILS(scene) {
			const hold = await scene.hold(CREATE_URL);
			await hold.abort(417);
			await dialog(scene).getByRole("button", { name: "Create" }).tap();
			await expect(scene.page.getByText("Something went wrong")).toBeVisible({ timeout: 30_000 });
			await expect(dialog(scene)).toBeVisible();
		},
		async SERVER_ANSWERS(scene) {
			await holds.get(scene)?.release();
			requested.add(scene);
			await expect(dialog(scene)).toHaveCount(0);
			await expect(panel(scene).getByText(/Making/)).toBeVisible();
			await expect(scene.page.getByText(/selected/)).toHaveCount(0);
		},
		async WORKER_FINISHES(scene) {
			await expect(panel(scene).getByText(/is ready/)).toBeVisible({ timeout: 180_000 });
		},
		async WORKER_FAILS() {},
		async OPEN_MOVIE(scene) {
			await panel(scene).getByRole("button", { name: "Open" }).tap();
			await expect(panel(scene)).toHaveCount(0);
			await expect(scene.page.locator("[data-photo]").first().getByText(/^\d+:\d\d$/)).toBeVisible({ timeout: 30_000 });
		},
	},
});
