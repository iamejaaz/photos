import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type FileChooser } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import { statePath, type Session } from "../global-setup";
import type { Hold, Scene } from "../scene";

type Event =
	| { type: "TAP_UPLOAD" }
	| { type: "PICK_PHOTO" }
	| { type: "PICK_DUPLICATE" }
	| { type: "PICK_BATCH" }
	| { type: "PICK_DOCUMENT" }
	| { type: "CHECKED" }
	| { type: "UPLOAD_FINISHES" }
	| { type: "UPLOAD_FAILS" }
	| { type: "SHOW_DETAILS" }
	| { type: "CLOSE_PANEL" };

/**
 * Adding photos from the header's Upload button: the file chooser, the
 * duplicate check, the upload itself, and the floating panel's outcomes. In the
 * code the panel's phase is read from `upload.active`, `upload.preparing` and
 * the counts of each item's `status` (data/uploads.ts, UploadPanel.vue); each
 * item's own `UploadStatus` union is the one explicit machine here.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "upload",
	initial: "timeline",
	states: {
		timeline: {
			meta: { description: "The Photos home with the Upload button in the header, before anything is picked." },
			on: { TAP_UPLOAD: "choosing" },
		},
		choosing: {
			meta: {
				description:
					"The system file picker is open (photos and videos only). It is the phone's own sheet, not part of the page, so there is nothing of Photos to screenshot.",
				transient: true,
			},
			on: { PICK_PHOTO: "preparing", PICK_DUPLICATE: "alreadyInPhotos", PICK_BATCH: "mixed", PICK_DOCUMENT: "rejected" },
		},
		preparing: {
			meta: { description: "One photo picked; Photos is checking whether it is already in the library: “Getting ready…”." },
			on: { CHECKED: "uploading" },
		},
		uploading: {
			meta: { description: "The photo is being sent: “Uploading 1 of 1”, bytes and percent, and a thin bar under the header." },
			on: { UPLOAD_FINISHES: "done", UPLOAD_FAILS: "failed" },
		},
		done: {
			meta: { description: "The upload finished: a green check and “1 item uploaded”, with Close." },
			on: { SHOW_DETAILS: "doneDetails", CLOSE_PANEL: "inTimeline" },
		},
		doneDetails: {
			meta: { description: "The finished panel opened up: one row per file with its check mark." },
		},
		inTimeline: {
			meta: { description: "The panel closed; the new photo sits at the top of the timeline." },
		},
		failed: {
			meta: { description: "The server refused the upload: a red mark and “0 uploaded, 1 failed”." },
			on: { SHOW_DETAILS: "failedDetails" },
		},
		failedDetails: {
			meta: { description: "The failed panel opened up: the file's row shows the reason the server gave." },
		},
		alreadyInPhotos: {
			meta: { description: "The picked photo is already in the library, so nothing is sent: “Already in Photos”." },
		},
		mixed: {
			meta: {
				description:
					"Three photos in one go, opened up: one uploaded, one already in Photos, one failed. The title reads “1 uploaded, 1 failed”.",
			},
		},
		rejected: {
			meta: { description: "Only a PDF was picked: nothing uploads and a warning toast says only photos and videos can be added." },
		},
	},
});

const FIXTURES = resolve(__dirname, "../.state/fixtures");
const PICTURES = { "Lisbon tram.jpg": "lisbon-tram.jpg", "Harbour at dusk.jpg": "harbour-at-dusk.jpg", "Market street.jpg": "market-street.jpg" };
type Picture = keyof typeof PICTURES;
const UPLOAD = "**/api/method/suite.drive.api.files.upload_file*";
const EXISTING = "**/api/method/photos.api.photos.existing_uploads*";

interface State {
	created: string[];
	files: Map<Picture, Buffer>;
	chooser?: FileChooser;
	upload?: Hold;
	existing?: Hold;
}
const state = new WeakMap<Scene, State>();
const of = (scene: Scene): State => {
	const value = state.get(scene);
	if (!value) throw new Error("upload: the scene was not entered");
	return value;
};

async function ensureFixtures(scene: Scene): Promise<void> {
	const missing = Object.values(PICTURES).filter((file) => !existsSync(resolve(FIXTURES, file)));
	if (!missing.length) return;
	mkdirSync(FIXTURES, { recursive: true });
	const page = await scene.call<{ rows: { name: string; mime_type: string; file_name: string }[] }>(
		"photos.api.photos.timeline",
		{ limit: 40 },
	);
	const sources = page.rows.filter((row) => row.mime_type === "image/jpeg" && !/collage/i.test(row.file_name));
	for (const [index, file] of missing.entries()) {
		const source = sources[index];
		if (!source) throw new Error("upload: not enough photos in the library to make fixtures");
		const response = await scene.context.request.get(`/api/method/photos.api.media.thumbnail?entity_name=${source.name}&large=1`);
		const raw = resolve(FIXTURES, `${file}.raw`);
		writeFileSync(raw, await response.body());
		execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", "640", raw, "--out", resolve(FIXTURES, file)]);
	}
}

/** Each scene gets its own bytes and size, so a photo left behind by another run never reads as a duplicate. */
function freshFiles(): Map<Picture, Buffer> {
	return new Map(
		(Object.entries(PICTURES) as [Picture, string][]).map(([name, file]) => [
			name,
			Buffer.concat([readFileSync(resolve(FIXTURES, file)), randomBytes(64 + Math.floor(Math.random() * 512))]),
		]),
	);
}

const payload = (scene: Scene, name: Picture) => ({ name, mimeType: "image/jpeg", buffer: of(scene).files.get(name) as Buffer });

/** Puts a photo in the library the way the app does, so picking the same file again finds it. */
async function seedUpload(scene: Scene, name: Picture): Promise<void> {
	const actor = (JSON.parse(readFileSync(statePath, "utf8")) as Record<string, Session>).actor;
	const parent = await scene.call<string>("photos.api.photos.get_upload_folder");
	const file = payload(scene, name);
	const response = await scene.context.request.post("/api/method/suite.drive.api.files.upload_file", {
		headers: { "X-Frappe-CSRF-Token": actor.csrf },
		multipart: {
			file,
			parent,
			uuid: randomUUID(),
			total_file_size: String(file.buffer.length),
			file_modified: String(Date.now()),
			chunk_index: "0",
			total_chunk_count: "1",
			chunk_byte_offset: "0",
		},
	});
	if (!response.ok()) throw new Error(`upload: seeding ${name} failed: ${response.status()}`);
	of(scene).created.push(((await response.json()) as { message: { name: string } }).message.name);
}

async function pick(scene: Scene, files: Parameters<FileChooser["setFiles"]>[0]): Promise<void> {
	const chooser = of(scene).chooser;
	if (!chooser) throw new Error("upload: the file chooser is not open");
	await chooser.setFiles(files);
}

const panel = (scene: Scene) => scene.page.getByRole("status").filter({ has: scene.page.getByRole("button", { name: /details/ }) });

async function expandPanel(scene: Scene): Promise<void> {
	await panel(scene).getByRole("button", { name: "Show details" }).tap();
	await expect(panel(scene).getByRole("listitem").first()).toBeVisible();
}

export const upload = defineFlow<Event>({
	id: "upload",
	title: "Upload",
	source: "frontend/src/data/uploads.ts, frontend/src/components/UploadPanel.vue, frontend/src/components/PhotosHeader.vue",
	machine,
	async enter(scene) {
		await ensureFixtures(scene);
		const value: State = { created: [], files: freshFiles() };
		state.set(scene, value);
		scene.page.on("response", async (response) => {
			if (!response.url().includes("suite.drive.api.files.upload_file") || !response.ok()) return;
			const name = ((await response.json().catch(() => null)) as { message?: { name?: string } } | null)?.message?.name;
			if (name) value.created.push(name);
		});
		scene.defer(async () => {
			await scene.page.waitForTimeout(500);
			const names = [...new Set(value.created)];
			if (!names.length) return;
			await scene.call("suite.drive.api.files.remove_or_restore", { entity_names: names });
			await scene.call("suite.drive.api.files.delete_entities", { entity_names: names });
		});
		await scene.goto("/");
		await expect(scene.page.locator("img[src*='thumbnail']").first()).toBeVisible();
	},
	settle: {
		async timeline(scene) {
			await expect(scene.page.getByRole("button", { name: "Upload", exact: true }).locator("visible=true")).toBeVisible();
		},
	},
	events: {
		async TAP_UPLOAD(scene) {
			const chooser = scene.page.waitForEvent("filechooser");
			await scene.page.getByRole("button", { name: "Upload", exact: true }).locator("visible=true").tap();
			of(scene).chooser = await chooser;
			expect(of(scene).chooser?.isMultiple()).toBe(true);
		},
		async PICK_PHOTO(scene) {
			of(scene).existing = await scene.hold(EXISTING);
			of(scene).upload = await scene.hold(UPLOAD);
			await pick(scene, payload(scene, "Lisbon tram.jpg"));
			await expect(panel(scene).getByText("Getting ready…")).toBeVisible();
		},
		async CHECKED(scene) {
			await of(scene).existing?.release();
			await expect(panel(scene).getByText("Uploading 1 of 1")).toBeVisible();
		},
		async UPLOAD_FINISHES(scene) {
			await of(scene).upload?.release();
			await expect(panel(scene).getByText("1 item uploaded")).toBeVisible();
		},
		async UPLOAD_FAILS(scene) {
			await of(scene).upload?.abort(500);
			await expect(panel(scene).getByText("0 uploaded, 1 failed")).toBeVisible();
		},
		async SHOW_DETAILS(scene) {
			await expandPanel(scene);
		},
		async CLOSE_PANEL(scene) {
			await panel(scene).getByRole("button", { name: "Close" }).tap();
			await expect(panel(scene)).toHaveCount(0);
			await expect(scene.page.getByText("Today").first()).toBeVisible();
		},
		async PICK_DUPLICATE(scene) {
			await seedUpload(scene, "Lisbon tram.jpg");
			await pick(scene, payload(scene, "Lisbon tram.jpg"));
			await expect(panel(scene).getByText("Already in Photos")).toBeVisible();
		},
		async PICK_BATCH(scene) {
			await seedUpload(scene, "Harbour at dusk.jpg");
			await scene.page.route(UPLOAD, async (route) => {
				if (route.request().postDataBuffer()?.includes('filename="Market street.jpg"'))
					await route.fulfill({ status: 413, contentType: "text/html", body: "Request Entity Too Large" });
				else await route.fallback();
			});
			await pick(scene, [payload(scene, "Lisbon tram.jpg"), payload(scene, "Harbour at dusk.jpg"), payload(scene, "Market street.jpg")]);
			await expect(panel(scene).getByText("1 uploaded, 1 failed")).toBeVisible();
			await expandPanel(scene);
		},
		async PICK_DOCUMENT(scene) {
			await pick(scene, { name: "Trip notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
			await expect(scene.page.getByText("Only photos and videos can be added here")).toBeVisible();
		},
	},
});
