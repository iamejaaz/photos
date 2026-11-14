import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "LOADS" }
	| { type: "FAILS" }
	| { type: "SHOW_HIDDEN" }
	| { type: "SUGGESTS_MERGE" }
	| { type: "OPEN_EMPTY_LIBRARY" }
	| { type: "OPEN_GONE_PERSON" }
	| { type: "OPEN_PERSON" }
	| { type: "START_NAMING" }
	| { type: "SAVE_NAME" }
	| { type: "TYPE_TAKEN_NAME" }
	| { type: "DISMISS" }
	| { type: "OPEN_MENU" }
	| { type: "PICK_SAME_PERSON" }
	| { type: "PICK_COVER" }
	| { type: "OPEN_PHOTO_INFO" }
	| { type: "MOVE_FACE" };

/**
 * People: the grid of detected people, one person's page with its rename,
 * cover, merge and duplicate-name dialogs, and the face controls in a photo's
 * info panel. In the code this is People.vue's `data` ref read as
 * undefined / disabled / empty / list, plus PersonPage.vue's `editing`,
 * `merging`, `choosingCover` and `duplicate` refs, each its own boolean.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "people",
	initial: "loading",
	states: {
		loading: {
			meta: { description: "The people request is still out: the header and an empty page, no spinner." },
			on: { LOADS: "populated", FAILS: "failed" },
		},
		failed: {
			meta: { description: "The people request failed: the page stays blank, with no message and no way to retry." },
		},
		populated: {
			meta: { description: "Everyone found in the library, biggest first; people without a name read Add a name." },
			on: {
				SHOW_HIDDEN: "showingHidden",
				SUGGESTS_MERGE: "mergeSuggestion",
				OPEN_EMPTY_LIBRARY: "empty",
				OPEN_GONE_PERSON: "personGone",
				OPEN_PERSON: "person",
			},
		},
		showingHidden: {
			meta: { description: "Show hidden people turned on: a person hidden from People (the third one here) is back in the grid, dimmed." },
		},
		mergeSuggestion: {
			meta: {
				description:
					"Two people that look alike: the Same or different? card above the grid. The pair here is shaped in the test, since the library has none today.",
			},
		},
		empty: {
			meta: { description: "A new person with no photos: the note that people show up once faces are processed." },
		},
		personGone: {
			meta: { description: "A link to a person who no longer exists: a toast, and the page falls back to People." },
		},
		person: {
			meta: { description: "One person's page: their face and Add a name in the header, their photos below." },
			on: { START_NAMING: "naming", OPEN_MENU: "personMenu", OPEN_PHOTO_INFO: "photoInfo", TYPE_TAKEN_NAME: "duplicateName" },
		},
		naming: {
			meta: { description: "Add a name tapped: the header turns into a name field with the keyboard up." },
			on: { SAVE_NAME: "named" },
		},
		named: {
			meta: { description: "A name saved with Enter: the header shows the new name." },
		},
		duplicateName: {
			meta: {
				description: "A name another person already has: the Same person? dialog with both faces, before anything is saved.",
			},
			on: { DISMISS: "person" },
		},
		personMenu: {
			meta: { description: "The person options menu: rename, cover photo, same person as, this is me, hide." },
			on: { PICK_SAME_PERSON: "mergePicker", PICK_COVER: "coverPicker" },
		},
		mergePicker: {
			meta: { description: "Same person as…: every other person, to pick the ones to merge in. Nothing picked yet." },
		},
		coverPicker: {
			meta: { description: "Change cover photo: every face of this person, the current cover ringed." },
		},
		photoInfo: {
			meta: { description: "A photo of this person opened with Info: the People section lists the faces in it." },
			on: { MOVE_FACE: "moveFace" },
		},
		moveFace: {
			meta: { description: "Move to another person: the Who is this? dialog to search or type a new name. Closed without saving." },
		},
	},
});

interface Picked {
	first: string;
	second: string;
	third: string;
}

const holds = new WeakMap<Scene, Hold>();
const picked = new WeakMap<Scene, Picked>();
const PEOPLE = /\/api\/method\/photos\.api\.people\.people(\?|$)/;
const TAKEN_NAME = "Leela Iyer";

interface PersonRow {
	name: string;
	person_name: string | null;
	cover_face: string;
	face_count: number;
}

function personLink(scene: Scene, name?: string) {
	return scene.page.locator(name ? `a[href='/photos/people/${name}']` : "a[href^='/photos/people/']");
}

function photoTiles(scene: Scene) {
	return scene.page.locator("img[src*='.thumbnail?entity_name']");
}

function pick(scene: Scene): Picked {
	const found = picked.get(scene);
	if (!found) throw new Error("people: the scene has no picked people");
	return found;
}

async function openPerson(scene: Scene): Promise<void> {
	await personLink(scene, pick(scene).first).first().tap();
	await expect(scene.page.getByRole("button", { name: "Person options" })).toBeVisible();
	await expect(photoTiles(scene).first()).toBeVisible();
}

async function rename(scene: Scene, person: string, name: string): Promise<void> {
	await scene.call("photos.api.people.rename_person", { person, person_name: name, separate: true });
}

export const people = defineFlow<Event>({
	id: "people",
	title: "People",
	source: "frontend/src/pages/People.vue, frontend/src/pages/PersonPage.vue, frontend/src/components/MoveFaceDialog.vue",
	machine,
	async enter(scene) {
		const { people: rows } = await scene.call<{ people: PersonRow[] }>("photos.api.people.people");
		const unnamed = rows.filter((row) => !row.person_name);
		if (unnamed.length < 3) throw new Error("people: the actor needs three unnamed people");
		picked.set(scene, { first: unnamed[0].name, second: unnamed[1].name, third: unnamed[2].name });
		holds.set(scene, await scene.hold(PEOPLE));
		await scene.goto("/people");
	},
	settle: {
		async loading(scene) {
			await expect(scene.page.getByText("People").first()).toBeVisible();
		},
	},
	events: {
		async LOADS(scene) {
			await holds.get(scene)?.release();
			await expect(personLink(scene).first()).toBeVisible();
		},
		async FAILS(scene) {
			const failed = scene.page.waitForResponse((response) => PEOPLE.test(response.url()) && response.status() >= 500);
			await holds.get(scene)?.abort();
			await failed;
			await scene.settle(1500);
			await expect(personLink(scene)).toHaveCount(0);
		},
		async SHOW_HIDDEN(scene) {
			const { third } = pick(scene);
			scene.defer(() => scene.call("photos.api.people.set_hidden", { person: third, hidden: false }));
			await scene.call("photos.api.people.set_hidden", { person: third, hidden: true });
			await scene.page.getByRole("button", { name: "Show hidden people" }).tap();
			await expect(scene.page.getByRole("button", { name: "Hide hidden people" })).toBeVisible();
			await expect(personLink(scene, third)).toHaveClass(/opacity-50/);
		},
		async SUGGESTS_MERGE(scene) {
			const { first, second } = pick(scene);
			const { people: rows } = await scene.call<{ people: PersonRow[] }>("photos.api.people.people");
			const summary = (name: string) => {
				const row = rows.find((each) => each.name === name);
				if (!row) throw new Error(`people: ${name} is gone`);
				return { name: row.name, person_name: row.person_name, cover_face: row.cover_face, face_count: row.face_count };
			};
			await scene.page.route("**/api/method/photos.api.people.merge_suggestions*", (route) =>
				route.fulfill({
					contentType: "application/json",
					body: JSON.stringify({ message: [{ first: summary(first), second: summary(second), score: 0.71 }] }),
				}),
			);
			await scene.page.reload();
			await expect(scene.page.getByText("Same or different?")).toBeVisible();
		},
		async OPEN_EMPTY_LIBRARY(scene) {
			await scene.signInAs("fresh");
			await scene.goto("/people");
			await expect(scene.page.getByText("People show up here once photos with faces are processed.")).toBeVisible();
		},
		async OPEN_GONE_PERSON(scene) {
			await scene.goto("/people/0000000000");
			await expect(scene.page.getByText("This person is no longer in your library.")).toBeVisible();
			await expect(personLink(scene).first()).toBeVisible();
		},
		async OPEN_PERSON(scene) {
			await openPerson(scene);
		},
		async START_NAMING(scene) {
			await scene.page.getByRole("button", { name: "Add a name" }).tap();
			await expect(scene.page.getByPlaceholder("Add a name")).toBeFocused();
		},
		async SAVE_NAME(scene) {
			const { first } = pick(scene);
			scene.defer(() => rename(scene, first, ""));
			const name = "Kabir Menon";
			await scene.page.getByPlaceholder("Add a name").fill(name);
			await scene.page.getByPlaceholder("Add a name").press("Enter");
			await expect(scene.page.getByRole("button", { name })).toBeVisible();
		},
		async TYPE_TAKEN_NAME(scene) {
			const { second } = pick(scene);
			scene.defer(() => rename(scene, second, ""));
			await rename(scene, second, TAKEN_NAME);
			await scene.page.getByRole("button", { name: "Add a name" }).tap();
			await scene.page.getByPlaceholder("Add a name").fill(TAKEN_NAME);
			await scene.page.getByPlaceholder("Add a name").press("Enter");
			await expect(scene.page.getByRole("heading", { name: "Same person?" })).toBeVisible();
			await expect(scene.page.getByRole("dialog").locator("img")).toHaveCount(2);
		},
		async DISMISS(scene) {
			await scene.page.keyboard.press("Escape");
			await expect(scene.page.getByRole("dialog")).toHaveCount(0);
			await expect(scene.page.getByRole("button", { name: "Add a name" })).toBeVisible();
		},
		async OPEN_MENU(scene) {
			await scene.page.getByRole("button", { name: "Person options" }).tap();
			await expect(scene.page.getByRole("menuitem", { name: "Same person as…" })).toBeVisible();
		},
		async PICK_SAME_PERSON(scene) {
			await scene.page.getByRole("menuitem", { name: "Same person as…" }).tap();
			const dialog = scene.page.getByRole("dialog");
			await expect(dialog.getByRole("button", { name: "Merge 0" })).toBeVisible();
			await expect(dialog.locator("img").first()).toBeVisible();
		},
		async PICK_COVER(scene) {
			await scene.page.getByRole("menuitem", { name: "Change cover photo" }).tap();
			await expect(scene.page.getByRole("button", { name: "Use as cover photo" }).first()).toBeVisible();
		},
		async OPEN_PHOTO_INFO(scene) {
			await photoTiles(scene).first().tap();
			await scene.page.getByRole("button", { name: "Info" }).last().tap();
			await expect(scene.page.getByText("People", { exact: true }).last()).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Add a name" }).last()).toBeVisible();
		},
		async MOVE_FACE(scene) {
			await scene.page.getByRole("button", { name: "Add a name" }).last().tap();
			await scene.page.getByRole("menuitem", { name: "Move to another person" }).tap();
			const dialog = scene.page.getByRole("dialog");
			await expect(dialog.getByText("Who is this?")).toBeVisible();
			await expect(dialog.getByPlaceholder("Search or type a new name")).toBeVisible();
			await expect(dialog.locator("button img").first()).toBeVisible();
		},
	},
});
