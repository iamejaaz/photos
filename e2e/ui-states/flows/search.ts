import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "TYPE" }
	| { type: "SUBMIT" }
	| { type: "SEARCH_MISS" }
	| { type: "BACK" }
	| { type: "TAP_PLACE" }
	| { type: "OPEN_EMPTY_LIBRARY" };

/**
 * The Search page from its suggestions to results, no results and failure. In
 * the code the page picks suggestions or results from `hasQuery` (Search.vue);
 * suggestions decide their own screen from `loaded` and four list lengths
 * (SearchSuggestions.vue); results reuse PhotoGrid.vue's chain over
 * `feed.loading`, `feed.loaded && !rows.length` and `feed.error`.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "search",
	initial: "suggestionsLoading",
	states: {
		suggestionsLoading: {
			meta: { description: "People and places are still loading: the search box with a spinner under it." },
			on: { LOADS: "suggestions", FAILS: "suggestionsFailed" },
		},
		suggestionsFailed: {
			meta: {
				description:
					"People and places failed to load: “Couldn't load suggestions” with a hint to check the connection and a Try again button.",
			},
		},
		suggestions: {
			meta: { description: "Ideas to search for: places and things found in the photos. People only show once someone is named, and nobody is named in this library yet." },
			on: { TYPE: "typing", TAP_PLACE: "placeResults", OPEN_EMPTY_LIBRARY: "emptyLibrary" },
		},
		typing: {
			meta: { description: "A word typed into the box; nothing searches until the keyboard's search key is pressed." },
			on: { SUBMIT: "resultsLoading" },
		},
		resultsLoading: {
			meta: { description: "The search is out: the title already reads “Results for “beach””, with a spinner under the box." },
			on: { LOADS: "results", FAILS: "resultsFailed" },
		},
		results: {
			meta: { description: "Photos that match “beach”, grouped by month and day like the timeline." },
			on: { BACK: "suggestionsWithRecent", SEARCH_MISS: "noResults" },
		},
		resultsFailed: {
			meta: {
				description: "The search request failed: “Couldn't load this” with a Try again button, not the “No results” empty state.",
			},
		},
		noResults: {
			meta: { description: "A search nothing matches (the year 1987): “No results” with ideas for other words." },
		},
		suggestionsWithRecent: {
			meta: { description: "Back from a search: the term is kept under Recent searches, above people and places." },
		},
		placeResults: {
			meta: { description: "A place chip tapped: every photo taken there, titled with the place name." },
		},
		emptyLibrary: {
			meta: { description: "A person with no photos yet opens Search: no suggestions, just a hint of what can be searched." },
		},
	},
});

const holds = new WeakMap<Scene, Hold>();
const SUGGESTIONS = /\/api\/method\/photos\.api\.(people\.people|photos\.explore)\b/;
const TIMELINE = "**/api/method/photos.api.photos.timeline*";

const box = (scene: Scene) => scene.page.getByPlaceholder("Search people, places, things, dates").locator("visible=true");
const tiles = (scene: Scene) => scene.page.locator("img[src*='thumbnail']");

async function searchFor(scene: Scene, term: string): Promise<void> {
	await box(scene).fill(term);
	await box(scene).press("Enter");
	await expect(scene.page.getByRole("heading", { name: `Results for “${term}”` })).toBeVisible();
}

export const search = defineFlow<Event>({
	id: "search",
	title: "Search",
	source: "frontend/src/pages/Search.vue, frontend/src/components/SearchSuggestions.vue, frontend/src/components/PhotoGrid.vue",
	machine,
	async enter(scene) {
		holds.set(scene, await scene.hold(SUGGESTIONS));
		await scene.goto("/search");
	},
	settle: {
		async suggestionsLoading(scene) {
			await expect(box(scene)).toBeVisible();
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			if (scene.page.url().includes("q="))
				await expect(tiles(scene).first()).toBeVisible();
			else await expect(scene.page.getByRole("heading", { name: "Places" })).toBeVisible();
		},
		async FAILS(scene) {
			await holds.get(scene)?.abort();
			if (scene.page.url().includes("q=")) {
				await expect(scene.page.getByText("Couldn't load this")).toBeVisible({ timeout: 30_000 });
				await expect(scene.page.getByText("No results")).toHaveCount(0);
			} else {
				await expect(scene.page.getByText("Couldn't load suggestions")).toBeVisible({ timeout: 30_000 });
				await expect(scene.page.getByText("Search your photos")).toHaveCount(0);
			}
			await expect(scene.page.getByRole("button", { name: "Try again" })).toBeVisible();
		},
		async TYPE(scene) {
			await box(scene).fill("beach");
			await expect(box(scene)).toHaveValue("beach");
		},
		async SUBMIT(scene) {
			holds.set(scene, await scene.hold(TIMELINE));
			await box(scene).press("Enter");
			await expect(scene.page.getByRole("heading", { name: "Results for “beach”" })).toBeVisible();
		},
		async SEARCH_MISS(scene) {
			await searchFor(scene, "1987");
			await expect(scene.page.getByText("No results")).toBeVisible();
		},
		async BACK(scene) {
			await scene.page.goBack();
			await expect(scene.page.getByRole("heading", { name: "Recent searches" })).toBeVisible();
			await expect(scene.page.getByRole("heading", { name: "Places" })).toBeVisible();
		},
		async TAP_PLACE(scene) {
			const chip = scene.page.locator("a[href*='place=']").first();
			const place = (await chip.innerText()).trim();
			await chip.tap();
			await expect(scene.page.getByRole("heading", { name: place })).toBeVisible();
			await expect(tiles(scene).first()).toBeVisible();
		},
		async OPEN_EMPTY_LIBRARY(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/search");
			await expect(scene.page.getByText("Search your photos")).toBeVisible();
		},
	},
});
