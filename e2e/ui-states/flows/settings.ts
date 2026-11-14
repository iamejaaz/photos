import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "OPEN_MEMORIES" }
	| { type: "OPEN_MEMORIES_SLOW" }
	| { type: "CHOOSE_PEOPLE" }
	| { type: "CLOSE_DIALOG" }
	| { type: "OPEN_IMPORT" }
	| { type: "OPEN_IMPORT_READING" }
	| { type: "OPEN_IMPORT_READY" }
	| { type: "OPEN_IMPORT_RUNNING" }
	| { type: "OPEN_IMPORT_DONE" }
	| { type: "OPEN_IMPORT_FAILED" }
	| { type: "OPEN_EXPORT" }
	| { type: "OPEN_DATA" }
	| { type: "ASK_DELETE_PHOTOS" }
	| { type: "ASK_DELETE_ACCOUNT" }
	| { type: "TYPE_DELETE" }
	| { type: "CANCEL" }
	| { type: "OPEN_UNKNOWN_SECTION" };

/**
 * Settings on a phone: the section list at /settings and each section at
 * /settings/<key>. SettingsPage.vue builds the list from `native`,
 * `getSessionUser()` and `settings.data.can_manage`; PhotosSettings.vue builds
 * the same list again for the desktop dialog. The Import section picks its
 * screen from `takeout.uploading` and the job's `status` string.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "settings",
	initial: "list",
	states: {
		list: {
			meta: { description: "The settings list for a person who is not an admin: Memories, Import, Export and Your data." },
			on: {
				OPEN_MEMORIES: "memories",
				OPEN_MEMORIES_SLOW: "memoriesLoading",
				OPEN_IMPORT: "importIdle",
				OPEN_IMPORT_READING: "importReading",
				OPEN_IMPORT_READY: "importReady",
				OPEN_IMPORT_RUNNING: "importRunning",
				OPEN_IMPORT_DONE: "importDone",
				OPEN_IMPORT_FAILED: "importFailed",
				OPEN_EXPORT: "export",
				OPEN_DATA: "data",
				OPEN_UNKNOWN_SECTION: "unknownSection",
			},
		},
		backup: {
			meta: {
				description: "Backup of this phone's camera roll. Only the Android and iOS apps list it, so the web never shows it.",
				transient: true,
			},
		},
		memoriesLoading: {
			meta: { description: "Memories while its preferences are still loading: the heading and an empty body, no spinner." },
		},
		memories: {
			meta: { description: "Memories: a switch to show them, and Choose to keep some people out of them." },
			on: { CHOOSE_PEOPLE: "hidePeople" },
		},
		hidePeople: {
			meta: { description: "The face picker for memories; nobody tapped, so nothing changes." },
			on: { CLOSE_DIALOG: "memories" },
		},
		importIdle: {
			meta: { description: "Import with no import yet: connect Google Photos, or follow the Takeout steps and choose zip files." },
		},
		importReading: {
			meta: { description: "Takeout zips uploaded and the server is reading them: “Reading your export…”." },
		},
		importReady: {
			meta: {
				description:
					"The export has been read: what it holds, Everything or Choose albums and years, archived and favourites, then Import.",
			},
		},
		importRunning: {
			meta: { description: "The import runs on the server: “Importing 120 of 342” with a progress bar." },
		},
		importDone: {
			meta: { description: "The import finished: what came in, what was already here, and Import more." },
		},
		importFailed: {
			meta: {
				description:
					"The server could not read the export: the error sits inside the same Takeout steps a new import shows, with Dismiss beside Choose zip files.",
			},
		},
		export: {
			meta: { description: "Export: what the zip holds and the Export everything button." },
		},
		data: {
			meta: { description: "Your data: download a copy, delete all photos, or delete the account." },
			on: { ASK_DELETE_PHOTOS: "confirmDeletePhotos", ASK_DELETE_ACCOUNT: "confirmDeleteAccount" },
		},
		confirmDeletePhotos: {
			meta: { description: "Delete all your photos? The red button stays off until DELETE is typed." },
			on: { CANCEL: "data" },
		},
		confirmDeleteAccount: {
			meta: { description: "Delete your account? Same guard: type DELETE first." },
			on: { TYPE_DELETE: "deleteArmed" },
		},
		deleteArmed: {
			meta: { description: "DELETE typed: the red Delete account button turns on. Cancelled here, nothing is sent." },
			on: { CANCEL: "data" },
		},
		unknownSection: {
			meta: {
				description:
					"A link to a section this person cannot see (/settings/backup on the web): the plain list shows, while the address still names the section.",
			},
		},
	},
});

const IMPORT = "**/api/method/photos.api.takeout.get_import*";
const PREFERENCES = "**/api/method/photos.api.preferences.get_preferences*";
const holds = new WeakMap<Scene, Hold>();

type Job = {
	name: string;
	status: "Reading" | "Ready" | "Importing" | "Done" | "Failed";
	summary: { albums: string[]; items: [number[], number, number, number, number][] } | null;
	done: number;
	total: number;
	result: { imported: number; skipped: number; albums: number } | null;
	error: string | null;
};

function takeoutSummary(): Job["summary"] {
	const albums = ["Goa weekend", "Family dinners", "Lisbon 2024"];
	const items: [number[], number, number, number, number][] = [];
	for (let index = 0; index < 342; index++) {
		const year = 2019 + (index % 6);
		const album = index % 7 === 0 ? [0] : index % 11 === 0 ? [1] : year === 2024 && index % 3 === 0 ? [2] : [];
		items.push([album, year, index % 40 === 0 ? 1 : 0, index % 15 === 0 ? 1 : 0, index % 25 === 0 ? 1 : 0]);
	}
	return { albums, items };
}

const JOBS: Record<"Reading" | "Ready" | "Importing" | "Done" | "Failed", Job> = {
	Reading: { name: "imp-reading", status: "Reading", summary: null, done: 0, total: 0, result: null, error: null },
	Ready: { name: "imp-ready", status: "Ready", summary: takeoutSummary(), done: 0, total: 0, result: null, error: null },
	Importing: { name: "imp-running", status: "Importing", summary: null, done: 120, total: 342, result: null, error: null },
	Done: {
		name: "imp-done",
		status: "Done",
		summary: null,
		done: 342,
		total: 342,
		result: { imported: 328, skipped: 14, albums: 3 },
		error: null,
	},
	Failed: {
		name: "imp-failed",
		status: "Failed",
		summary: null,
		done: 0,
		total: 0,
		result: null,
		error: "takeout-20241102-002.zip is not a Google Takeout export.",
	},
};

/** No Takeout import can be made through the API without real zips, so the job is shaped in the response. */
async function openImportAs(scene: Scene, status: keyof typeof JOBS): Promise<void> {
	await scene.page.route(IMPORT, (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: JOBS[status] }) }),
	);
	await openSection(scene, "Import");
}

async function openSection(scene: Scene, label: string): Promise<void> {
	await scene.page.getByRole("link", { name: new RegExp(`^${label}`) }).tap();
	await expect(scene.page.getByRole("heading", { level: 1 })).toHaveText(label);
}

const dialog = (scene: Scene) => scene.page.getByRole("dialog");

export const settings = defineFlow<Event>({
	id: "settings",
	title: "Settings",
	source:
		"frontend/src/pages/SettingsPage.vue, frontend/src/components/settings/*.vue, frontend/src/data/imports.ts (ImportJob.status is the one explicit machine)",
	machine,
	async enter(scene) {
		await scene.goto("/settings");
		await expect(scene.page.getByRole("link", { name: /^Your data/ })).toBeVisible();
	},
	frame(scene, state) {
		return state === "importReady" ? scene.page.locator(".settings-page") : null;
	},
	events: {
		async OPEN_MEMORIES(scene) {
			await openSection(scene, "Memories");
			await expect(scene.page.getByRole("button", { name: "Choose" })).toBeVisible();
		},
		async OPEN_MEMORIES_SLOW(scene) {
			holds.set(scene, await scene.hold(PREFERENCES));
			await openSection(scene, "Memories");
			await expect(scene.page.getByText("Choose what shows up at the top of your photos.")).toBeVisible();
		},
		async CHOOSE_PEOPLE(scene) {
			await scene.page.getByRole("button", { name: "Choose" }).tap();
			await expect(dialog(scene).getByText("Hide faces from memories")).toBeVisible();
			await expect(dialog(scene).locator("button[aria-pressed]").first()).toBeVisible();
		},
		async CLOSE_DIALOG(scene) {
			await scene.page.keyboard.press("Escape");
			await expect(dialog(scene)).toHaveCount(0);
		},
		async OPEN_IMPORT(scene) {
			await openSection(scene, "Import");
			await expect(scene.page.getByRole("button", { name: "Choose zip files" })).toBeVisible();
			await expect(scene.page.getByRole("button", { name: "Connect Google account" }).or(scene.page.getByText(/Ask your administrator|Choose photos/)).first()).toBeVisible();
		},
		async OPEN_IMPORT_READING(scene) {
			await openImportAs(scene, "Reading");
			await expect(scene.page.getByText("Reading your export…")).toBeVisible();
		},
		async OPEN_IMPORT_READY(scene) {
			await openImportAs(scene, "Ready");
			await expect(scene.page.getByRole("button", { name: /^Import \d+ items$/ })).toBeVisible();
		},
		async OPEN_IMPORT_RUNNING(scene) {
			await openImportAs(scene, "Importing");
			await expect(scene.page.getByText("Importing 120 of 342")).toBeVisible();
		},
		async OPEN_IMPORT_DONE(scene) {
			await openImportAs(scene, "Done");
			await expect(scene.page.getByRole("button", { name: "Import more" })).toBeVisible();
		},
		async OPEN_IMPORT_FAILED(scene) {
			await openImportAs(scene, "Failed");
			await expect(scene.page.getByText("is not a Google Takeout export")).toBeVisible();
		},
		async OPEN_EXPORT(scene) {
			await openSection(scene, "Export");
			await expect(scene.page.getByRole("button", { name: "Export everything" })).toBeVisible();
		},
		async OPEN_DATA(scene) {
			await openSection(scene, "Your data");
			await expect(scene.page.getByRole("button", { name: "Delete account" })).toBeVisible();
		},
		async ASK_DELETE_PHOTOS(scene) {
			await scene.page.getByRole("button", { name: "Delete photos" }).tap();
			await expect(dialog(scene).getByText("Delete all your photos?")).toBeVisible();
			await expect(dialog(scene).getByRole("button", { name: "Delete photos" })).toBeDisabled();
		},
		async ASK_DELETE_ACCOUNT(scene) {
			await scene.page.getByRole("button", { name: "Delete account" }).tap();
			await expect(dialog(scene).getByText("Delete your account?")).toBeVisible();
			await expect(dialog(scene).getByRole("button", { name: "Delete account" })).toBeDisabled();
		},
		async TYPE_DELETE(scene) {
			await dialog(scene).getByPlaceholder("Type DELETE to confirm").fill("DELETE");
			await expect(dialog(scene).getByRole("button", { name: "Delete account" })).toBeEnabled();
		},
		async CANCEL(scene) {
			await dialog(scene).getByRole("button", { name: "Cancel" }).tap();
			await expect(dialog(scene)).toHaveCount(0);
		},
		async OPEN_UNKNOWN_SECTION(scene) {
			await scene.goto("/settings/backup");
			await expect(scene.page.getByRole("heading", { level: 1 })).toHaveText("Settings");
			await expect(scene.page.getByRole("link", { name: /^Memories/ })).toBeVisible();
		},
	},
});
