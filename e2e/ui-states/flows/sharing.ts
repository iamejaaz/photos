import { expect } from "@playwright/test";
import { setup } from "xstate";
import { defineFlow } from "../flow";
import type { Scene } from "../scene";

type Event =
	| { type: "OPEN_SHARE" }
	| { type: "CHOOSE_ANYONE" }
	| { type: "COPY_LINK" }
	| { type: "SHARE_WITH_PEER" }
	| { type: "OPEN_LINK_SETTINGS" }
	| { type: "PEER_OPENS_SHARING" }
	| { type: "PEER_OPENS_ALBUM" }
	| { type: "PEER_OPENS_MENU" }
	| { type: "VISITOR_OPENS_LINK" }
	| { type: "LINK_STOPPED" }
	| { type: "VISITOR_OPENS_EXPIRED" }
	| { type: "VISITOR_OPENS_LOCKED" }
	| { type: "OPEN_MY_SHARING" }
	| { type: "STOP_LINK" }
	| { type: "OPEN_EMPTY_SHARING" };

/**
 * Sharing an album and what each side sees: the owner's share dialog and
 * link settings, the person it was shared with, a signed-out visitor on the
 * public link (open, stopped, expired, locked), the owner's Links you shared,
 * and an empty Sharing page. In the code the visitor's screen is Album.vue's
 * chain over `gate` ('locked' | 'expired' | null) and `error`, decided by a
 * get_album failure followed by album_gate; the album's access is the
 * `access` object from album_access() in photos/api/albums.py.
 */
const machine = setup({ types: { events: {} as Event } }).createMachine({
	id: "sharing",
	initial: "ownAlbum",
	states: {
		ownAlbum: {
			meta: { description: "Maya's own album with photos, not shared yet, with Share in the header." },
			on: {
				OPEN_SHARE: "shareDialog",
				SHARE_WITH_PEER: "sharedWithPeer",
				OPEN_LINK_SETTINGS: "linkSettingsPrivate",
				PEER_OPENS_SHARING: "peerSharing",
				VISITOR_OPENS_LINK: "visitorAlbum",
				VISITOR_OPENS_EXPIRED: "visitorExpired",
				VISITOR_OPENS_LOCKED: "visitorLocked",
				OPEN_MY_SHARING: "ownerLinks",
				OPEN_EMPTY_SHARING: "sharingEmpty",
			},
		},
		shareDialog: {
			meta: { description: "The share dialog on a private album: invited members only, Maya as owner, Copy link." },
			on: { CHOOSE_ANYONE: "shareDialogPublic", COPY_LINK: "linkCopied" },
		},
		shareDialogPublic: {
			meta: { description: "General access switched to Accessible to all: anyone with the link can view." },
		},
		linkCopied: {
			meta: { description: "Copy link pressed: the toast says the link is on the clipboard." },
		},
		sharedWithPeer: {
			meta: { description: "The share dialog after the album was shared with Priya: she is listed as a member who can view." },
		},
		linkSettingsPrivate: {
			meta: { description: "Link settings on an album without a public link: a note that they apply only to Anyone with the link, with Share." },
		},
		peerSharing: {
			meta: { description: "Priya's Sharing page: Maya's album with her name and the count." },
			on: { PEER_OPENS_ALBUM: "peerAlbum" },
		},
		peerAlbum: {
			meta: { description: "Priya inside the album shared with her: photos, no Add photos or Share." },
			on: { PEER_OPENS_MENU: "peerMenu" },
		},
		peerMenu: {
			meta: { description: "Priya's album menu: Activity, Slideshow, Download album and Leave album, no Rename or Delete." },
		},
		visitorAlbum: {
			meta: { description: "A signed-out visitor on the public link: the album title and photos, no sign-in wall." },
			on: { LINK_STOPPED: "visitorStopped" },
		},
		visitorStopped: {
			meta: { description: "The same visitor after Maya stopped the link: You can't open this album, with Sign in." },
		},
		visitorExpired: {
			meta: { description: "A visitor on a public link past its expiry date: This link has expired." },
		},
		visitorLocked: {
			meta: { description: "A visitor on a password-protected link: the password form before any photo shows." },
		},
		ownerLinks: {
			meta: { description: "Maya's Sharing page with Links you shared: each link with Copy link and Stop sharing." },
			on: { STOP_LINK: "linkStopped" },
		},
		linkStopped: {
			meta: { description: "Stop sharing pressed: the row is gone and a toast says the link stopped." },
		},
		sharingEmpty: {
			meta: {
				description:
					"A new person's Sharing page: Nothing shared with you yet. Shaped: albums shared with the whole site reach every user here, so the shared list is emptied in the browser.",
			},
		},
	},
});

interface Seed {
	album: string;
	title: string;
	file: string;
}

interface Row {
	name: string;
	mime_type: string | null;
	file_name: string;
	creation: string;
}

const seeds = new WeakMap<Scene, Seed>();
const PEER = "priya@example.com";

function seed(scene: Scene): Seed {
	const value = seeds.get(scene);
	if (!value) throw new Error("sharing: nothing seeded");
	return value;
}

async function libraryPhotos(scene: Scene, count: number): Promise<string[]> {
	const { rows } = await scene.call<{ rows: Row[] }>("photos.api.photos.timeline", { start: 0 });
	const today = new Date().toISOString().slice(0, 10);
	const stable = rows.filter(
		(row) => row.mime_type?.startsWith("image/") && row.creation.slice(0, 10) < today && !/^Collage|^Movie/.test(row.file_name),
	);
	const picked = (stable.length >= count ? stable : rows).slice(0, count).map((row) => row.name);
	if (picked.length < count) throw new Error("sharing: the actor's library has too few photos");
	return picked;
}

async function share(scene: Scene, user: string): Promise<void> {
	const { file } = seed(scene);
	await scene.call("suite.drive.api.files.update_access", { entity_name: file, method: "share", user, read: 1, comment: 1 });
	scene.defer(() => scene.call("suite.drive.api.files.update_access", { entity_name: file, method: "unshare", user }));
}

async function linkSettings(scene: Scene, values: Record<string, unknown>): Promise<void> {
	const { album } = seed(scene);
	await scene.call("photos.api.albums.save_link_settings", { album, allow_download: 1, ...values });
	scene.defer(() =>
		scene.call("photos.api.albums.save_link_settings", { album, allow_download: 1, link_expires_on: null, remove_password: 1 }),
	);
}

async function visit(scene: Scene): Promise<void> {
	await scene.signInAs("visitor");
	await scene.goto(`/albums/${seed(scene).album}`);
}

function shareDialog(scene: Scene) {
	return scene.page.getByRole("dialog").filter({ hasText: "General access" });
}

async function openShare(scene: Scene): Promise<void> {
	await scene.page.getByRole("button", { name: "Share", exact: true }).tap();
	await expect(shareDialog(scene).getByText("Owner (you)")).toBeVisible();
	await expect(shareDialog(scene).getByRole("combobox").first()).toBeEnabled();
}

export const sharing = defineFlow<Event>({
	id: "sharing",
	title: "Sharing",
	source: "frontend/src/pages/Albums.vue (shared), frontend/src/pages/Album.vue, frontend/src/components/ShareAlbumDialog.vue, frontend/src/components/AlbumLinkDialog.vue, photos/api/albums.py (album_access, album_gate)",
	machine,
	async enter(scene) {
		const title = scene.name("Lisbon weekend");
		const album = await scene.call<string>("photos.api.albums.create_album", { title, files: await libraryPhotos(scene, 5) });
		scene.defer(() => scene.call("photos.api.albums.delete_album", { album }));
		const entity = await scene.call<{ name: string }>("suite.drive.overrides.file.get_file_for_doc", {
			doctype: "Photo Album",
			docname: album,
		});
		seeds.set(scene, { album, title, file: entity.name });
		await scene.goto(`/albums/${album}`);
		await expect(scene.page.getByRole("heading", { name: title })).toBeVisible();
		await expect(scene.page.locator("img[src*='thumbnail']").nth(4)).toBeVisible();
	},
	events: {
		async OPEN_SHARE(scene) {
			await openShare(scene);
		},
		async CHOOSE_ANYONE(scene) {
			const { file } = seed(scene);
			scene.defer(() => scene.call("suite.drive.api.files.update_access", { entity_name: file, method: "unshare", user: "" }));
			await shareDialog(scene).getByRole("combobox").first().tap();
			const saved = scene.page.waitForResponse((response) => response.url().includes("update_access"));
			await scene.page.getByRole("option", { name: "Accessible to all" }).tap();
			await saved;
			await expect(shareDialog(scene).getByRole("combobox").first()).toContainText("Accessible to all");
		},
		async COPY_LINK(scene) {
			await scene.context.grantPermissions(["clipboard-read", "clipboard-write"]);
			await shareDialog(scene).getByRole("button", { name: "Copy link" }).tap();
			await expect(scene.page.getByText("Copied to your clipboard.")).toBeVisible();
		},
		async SHARE_WITH_PEER(scene) {
			await share(scene, PEER);
			await openShare(scene);
			await expect(shareDialog(scene).getByText("Priya Sharma")).toBeVisible();
		},
		async OPEN_LINK_SETTINGS(scene) {
			await scene.page.getByRole("button", { name: "Album options" }).tap();
			await scene.page.getByRole("menuitem", { name: "Link settings" }).tap();
			await expect(scene.page.getByText("Let people add photos")).toBeVisible();
		},
		async PEER_OPENS_SHARING(scene) {
			await share(scene, PEER);
			await scene.signInAs("peer");
			await scene.goto("/sharing");
			await expect(scene.page.getByRole("link", { name: new RegExp(seed(scene).title) })).toBeVisible();
		},
		async PEER_OPENS_ALBUM(scene) {
			await scene.page.getByRole("link", { name: new RegExp(seed(scene).title) }).tap();
			await expect(scene.page.getByRole("heading", { name: seed(scene).title })).toBeVisible();
			await expect(scene.page.locator("img[src*='thumbnail']").nth(4)).toBeVisible();
		},
		async PEER_OPENS_MENU(scene) {
			await scene.page.getByRole("button", { name: "Album options" }).tap();
			await expect(scene.page.getByRole("menuitem", { name: "Leave album" })).toBeVisible();
		},
		async VISITOR_OPENS_LINK(scene) {
			await share(scene, "");
			await visit(scene);
			await expect(scene.page.getByRole("heading", { name: seed(scene).title })).toBeVisible();
			await expect(scene.page.locator("img[src*='thumbnail']").nth(4)).toBeVisible();
		},
		async LINK_STOPPED(scene) {
			const { file } = seed(scene);
			await scene.call("suite.drive.api.files.update_access", { entity_name: file, method: "unshare", user: "" });
			await scene.page.reload();
			await expect(scene.page.getByText("You can't open this album")).toBeVisible();
		},
		async VISITOR_OPENS_EXPIRED(scene) {
			await share(scene, "");
			await linkSettings(scene, { link_expires_on: "2026-01-31 23:59:59" });
			await visit(scene);
			await expect(scene.page.getByText("This link has expired")).toBeVisible();
		},
		async VISITOR_OPENS_LOCKED(scene) {
			await share(scene, "");
			await linkSettings(scene, { password: "tram28-alfama" });
			await visit(scene);
			await expect(scene.page.getByText("This album is protected")).toBeVisible();
		},
		async OPEN_MY_SHARING(scene) {
			const picks = await libraryPhotos(scene, 2);
			const link = await scene.call<string>("photos.api.albums.create_share_link", { files: picks });
			scene.defer(() => scene.call("photos.api.albums.delete_album", { album: link }).catch(() => undefined));
			const title = scene.name("Lisbon picks for Priya");
			await scene.call("photos.api.albums.rename_album", { album: link, title });
			seeds.set(scene, { ...seed(scene), title });
			await scene.goto("/sharing");
			await expect(scene.page.getByText("Links you shared")).toBeVisible();
			await expect(scene.page.getByText(title)).toBeVisible();
		},
		async STOP_LINK(scene) {
			const { title } = seed(scene);
			const row = scene.page.locator("div.py-2").filter({ hasText: title });
			await row.getByRole("button", { name: "Stop sharing" }).tap();
			await expect(scene.page.getByText("Link stopped")).toBeVisible();
			await expect(scene.page.getByText(title)).toHaveCount(0);
		},
		async OPEN_EMPTY_SHARING(scene) {
			await scene.signInAs("fresh");
			await scene.page.route("**/api/method/photos.api.albums.shared_albums", (route) =>
				route.fulfill({ contentType: "application/json", body: JSON.stringify({ message: [] }) }),
			);
			await scene.goto("/sharing");
			await expect(scene.page.getByText("Nothing shared with you yet")).toBeVisible();
		},
	},
});
