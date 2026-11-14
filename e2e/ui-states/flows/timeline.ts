import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "RELOAD" }
	| { type: "SELECT_TWO" }
	| { type: "CLEAR_SELECTION" }
	| { type: "OPEN_EMPTY_LIBRARY" };

/**
 * The Photos home: the month-grouped grid from first paint to loaded, failed,
 * empty and selecting. In the code this is PhotoGrid.vue's v-if chain over
 * `feed.loading`, `feed.loaded && !rows.length` and `feed.error`, plus the
 * module-level `selection` set.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "timeline",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "The timeline request is still out: the header and a spinner, no tiles yet." },
			on: { LOADS: "populated", FAILS: "failed" },
		},
		failed: {
			meta: { description: "The timeline request failed: what the grid shows when the server errors." },
			on: { RELOAD: "populated" },
		},
		populated: {
			meta: { description: "A full library: photos grouped by month and day, newest first." },
			on: { SELECT_TWO: "selecting", OPEN_EMPTY_LIBRARY: "empty" },
		},
		selecting: {
			meta: { description: "Two photos picked: the header turns into the selection bar with its actions." },
			on: { CLEAR_SELECTION: "populated" },
		},
		empty: {
			meta: { description: "A new person with nothing uploaded yet: the welcome screen and ways to add photos." },
		},
	},
});

const holds = new WeakMap<Scene, Hold>();
const TIMELINE = "**/api/method/photos.api.photos.timeline*";

async function expectTiles(scene: Scene): Promise<void> {
	await expect(scene.page.locator("img[src*='thumbnail']").first()).toBeVisible();
}

export const timeline = defineFlow<Event>({
	id: "timeline",
	title: "Timeline",
	source: "frontend/src/pages/Timeline.vue, frontend/src/components/PhotoGrid.vue",
	machine,
	async enter(scene) {
		holds.set(scene, await scene.hold(TIMELINE));
		await scene.goto("/");
	},
	settle: {
		async loading(scene) {
			await expect(scene.page.getByRole("heading", { name: "Photos" }).or(scene.page.getByText("Photos").first())).toBeVisible();
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			await expectTiles(scene);
		},
		async FAILS(scene) {
			await holds.get(scene)?.abort();
			await expect(scene.page.getByText("Something went wrong").first()).toBeVisible({ timeout: 30_000 });
		},
		async RELOAD(scene) {
			await holds.get(scene)?.release();
			await scene.page.reload();
			await expectTiles(scene);
		},
		async SELECT_TWO(scene) {
			const tiles = scene.page.locator("img[src*='thumbnail']");
			await scene.longPress(tiles.nth(0));
			await tiles.nth(1).tap();
			await expect(scene.page.getByText(/2 selected/).first()).toBeVisible();
		},
		async CLEAR_SELECTION(scene) {
			await scene.page.getByRole("button", { name: /clear|cancel|close/i }).first().tap();
			await expect(scene.page.getByText(/selected/)).toHaveCount(0);
		},
		async OPEN_EMPTY_LIBRARY(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/");
			await expect(scene.page.getByText("Welcome to Photos")).toBeVisible();
		},
	},
});
