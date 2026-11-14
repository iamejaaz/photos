import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "SCROLL_DOWN" }
	| { type: "OPEN_PLACE" }
	| { type: "OPEN_THING" }
	| { type: "OPEN_EMPTY_LIBRARY" }
	| { type: "OPEN_MEMORIES" }
	| { type: "PLAY_MEMORY" }
	| { type: "OPEN_MEMORY_MENU" }
	| { type: "HIDE_FACES" };

/**
 * Explore and memories: the Explore page from first paint to its sections,
 * a place or a thing opened as a search, and a memory played as a story.
 * In the code Explore.vue reads three unrelated requests (`data`,
 * `allPlaces`, `people` with `peopleLoaded`) and derives `empty` from them;
 * MemoryStory.vue keeps `story.open`, `paused` (from menu, faces dialog,
 * share dialog and `held`) and `loaded` beside each other.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "explore",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "Explore, people and places requests still out: only the Places heading shows, no spinner." },
			on: { LOADS: "populated", FAILS: "failed" },
		},
		failed: {
			meta: { description: "All three requests failed: the page keeps the bare Places heading, with no message and no retry." },
		},
		populated: {
			meta: { description: "The top of Explore: a row of people, the places map and named places with their counts." },
			on: {
				SCROLL_DOWN: "lowerSections",
				OPEN_PLACE: "placeOpened",
				OPEN_THING: "thingOpened",
				OPEN_EMPTY_LIBRARY: "empty",
				OPEN_MEMORIES: "memories",
			},
		},
		lowerSections: {
			meta: { description: "Further down: Things, Cameras and Media types, each a tile with a cover and a count." },
		},
		placeOpened: {
			meta: { description: "A named place tapped: a search for that place, its photos by day." },
		},
		thingOpened: {
			meta: { description: "A thing tapped (Mountains): a search for that thing, its photos by day." },
		},
		empty: {
			meta: { description: "A new person with nothing uploaded: Explore your photos and an Upload photos button." },
		},
		memories: {
			meta: {
				description:
					"Memories on the timeline: one card per past year. The memories are shaped in the test from real older photos, since none fall on today's date.",
			},
			on: { PLAY_MEMORY: "memoryStory" },
		},
		memoryStory: {
			meta: { description: "A memory playing full screen: progress bars per photo, the year and date, and the story controls." },
			on: { OPEN_MEMORY_MENU: "memoryMenu" },
		},
		memoryMenu: {
			meta: { description: "More options in a story: remove this photo, or hide faces. The story pauses while it is open." },
			on: { HIDE_FACES: "hideFaces" },
		},
		hideFaces: {
			meta: { description: "Hide faces from memories: the people in this photo, tap one to keep them out of memories. Nothing tapped." },
		},
	},
});

interface Row {
	name: string;
	taken: string;
	mime_type: string;
}

const holds = new WeakMap<Scene, Hold>();
const LOADS = /\/api\/method\/photos\.api\.(photos\.(explore|places)|people\.people)(\?|$)/;
const PLACE = "Mumbai, India";
const THING = "Mountains";

function year(row: Row): number {
	return Number(row.taken.slice(0, 4));
}

async function memoriesFor(scene: Scene) {
	const now = new Date().getFullYear();
	const { rows } = await scene.call<{ rows: Row[] }>("photos.api.photos.timeline", { limit: 1000 });
	const older = rows.filter((row) => row.taken && year(row) < now && row.mime_type.startsWith("image/"));
	const { people } = await scene.call<{ people: { name: string }[] }>("photos.api.people.people");
	let lead: Row | undefined;
	for (const person of people.slice(0, 5)) {
		const found = await scene.call<{ rows: Row[] }>("photos.api.people.person_photos", { person: person.name, limit: 200 });
		lead = found.rows.find((row) => row.taken && year(row) < now && row.mime_type.startsWith("image/"));
		if (lead) break;
	}
	if (!lead) throw new Error("explore: no older photo with a face");
	const years = [...new Set(older.map(year))].sort((a, b) => b - a);
	const leadYear = year(lead);
	const picked = [leadYear, ...years.filter((each) => each !== leadYear)].slice(0, 3);
	return picked.map((each) => {
		const photos = older.filter((row) => year(row) === each && row.name !== lead?.name).slice(0, 6);
		if (each === leadYear) photos.push(lead as Row);
		return { year: each, years_ago: now - each, photos, seen: false };
	});
}

export const explore = defineFlow<Event>({
	id: "explore",
	title: "Explore and places",
	source: "frontend/src/pages/Explore.vue, frontend/src/components/PlacesMap.vue, frontend/src/components/Memories.vue, frontend/src/components/MemoryStory.vue",
	machine,
	async enter(scene) {
		holds.set(scene, await scene.hold(LOADS));
		await scene.goto("/explore");
	},
	settle: {
		async loading(scene) {
			await expect(scene.page.getByRole("heading", { name: "Places" })).toBeVisible();
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			await expect(scene.page.locator(".leaflet-marker-icon").first()).toBeVisible();
			await expect(scene.page.getByRole("link", { name: new RegExp(PLACE) })).toBeVisible();
			await scene.settle(1500);
		},
		async FAILS(scene) {
			const failed = scene.page.waitForResponse((response) => LOADS.test(response.url()) && response.status() >= 500);
			await holds.get(scene)?.abort();
			await failed;
			await scene.settle(1500);
			await expect(scene.page.getByRole("heading", { name: "Places" })).toBeVisible();
		},
		async SCROLL_DOWN(scene) {
			await scene.page.getByRole("heading", { name: "Things" }).scrollIntoViewIfNeeded();
			await scene.page.getByRole("heading", { name: "Things" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
			await expect(scene.page.getByRole("heading", { name: "Cameras" })).toBeVisible();
		},
		async OPEN_PLACE(scene) {
			await scene.page.getByRole("link", { name: new RegExp(PLACE) }).tap();
			await expect(scene.page).toHaveURL(/\/search\?place=/);
			await expect(scene.page.getByText(PLACE).first()).toBeVisible();
			await expect(scene.page.locator("img[src*='.thumbnail?entity_name']").first()).toBeVisible();
		},
		async OPEN_THING(scene) {
			const tile = scene.page.getByRole("link", { name: new RegExp(`^${THING}`) });
			await tile.scrollIntoViewIfNeeded();
			await tile.tap();
			await expect(scene.page).toHaveURL(/\/search\?thing=/);
			await expect(scene.page.locator("img[src*='.thumbnail?entity_name']").first()).toBeVisible();
		},
		async OPEN_EMPTY_LIBRARY(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/explore");
			await expect(scene.page.getByText("Explore your photos")).toBeVisible();
		},
		async OPEN_MEMORIES(scene) {
			const memories = await memoriesFor(scene);
			await scene.page.route("**/api/method/photos.api.photos.memories*", (route) =>
				route.fulfill({ contentType: "application/json", body: JSON.stringify({ message: memories }) }),
			);
			await scene.page.route("**/api/method/photos.api.photos.mark_memories_seen*", (route) =>
				route.fulfill({ contentType: "application/json", body: JSON.stringify({ message: null }) }),
			);
			await scene.goto("/");
			await expect(scene.page.getByRole("button", { name: /years? ago/ }).first()).toBeVisible();
			await scene.settle(1000);
		},
		async PLAY_MEMORY(scene) {
			await scene.page.getByRole("button", { name: /years? ago/ }).first().tap();
			await expect(scene.page.getByRole("button", { name: "More options" })).toBeVisible();
			await expect(scene.page.locator(".story-image")).toBeVisible();
			await scene.settle(1200);
		},
		async OPEN_MEMORY_MENU(scene) {
			await scene.page.getByRole("button", { name: "More options" }).tap();
			await expect(scene.page.getByRole("menuitem", { name: "Hide faces from memories" })).toBeVisible();
		},
		async HIDE_FACES(scene) {
			await scene.page.getByRole("menuitem", { name: "Hide faces from memories" }).tap();
			const dialog = scene.page.getByRole("dialog");
			await expect(dialog.getByText("Hide faces from memories")).toBeVisible();
			await expect(dialog.locator("button[aria-pressed='false'] img").first()).toBeVisible();
		},
	},
});
