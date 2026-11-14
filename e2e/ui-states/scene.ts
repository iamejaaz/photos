import { readFileSync } from "node:fs";
import type { APIRequestContext, Browser, BrowserContext, Locator, Page, Route } from "@playwright/test";
import { statePath, type Session, USERS } from "./global-setup";

/** Phone size: Photos is used mostly on phones, and the native apps render this layout. */
export const VIEWPORT = { width: 390, height: 844 };
const SETTLE_MS = 500;

export type Role = keyof typeof USERS;

/**
 * A request hold: matching traffic waits until the hold ends. `abort` fails the
 * held requests and every later match until `release`, since frappe-ui retries.
 */
export interface Hold {
	release(): Promise<void>;
	abort(status?: number): Promise<void>;
}

/**
 * One signed-in page per capture path. The actor (Maya Rao, demo@example.com)
 * owns a full library; `peer` (Priya Sharma) shares with her; `fresh`
 * (Arjun Mehta) has an empty library for empty states. Changes a path makes to
 * shared data are undone on close through `defer`.
 */
export interface Scene {
	page: Page;
	context: BrowserContext;
	baseURL: string;
	/** Who the page is signed in as. Starts as the actor. */
	role: Role | "visitor";
	/** A name unique to this path, for albums and other things a path creates. */
	name(label: string): string;
	/** Opens a Photos route, for example `/` or `/albums`. */
	goto(path: string): Promise<void>;
	/** Moves the scene to a new page signed in as another person (a fresh context, so no cached boot); call before `goto`. */
	signInAs(role: Role | "visitor"): Promise<void>;
	/** Calls a whitelisted method as the actor or another person and returns `message`. */
	call<T = unknown>(method: string, args?: Record<string, unknown>, role?: Role): Promise<T>;
	/** Runs on close, last registered first, to undo what the path changed. */
	defer(undo: () => Promise<unknown>): void;
	hold(url: string | RegExp): Promise<Hold>;
	/** Presses and holds a finger on the element, as a touch long-press (selection starts this way on phones). */
	longPress(target: Locator, ms?: number): Promise<void>;
	settle(ms?: number): Promise<void>;
	close(): Promise<void>;
}

function sessions(): Record<Role, Session> {
	return JSON.parse(readFileSync(statePath, "utf8"));
}

export async function openScene(browser: Browser, baseURL: string, label: string): Promise<Scene> {
	const who = sessions();
	const host = new URL(baseURL).hostname;
	const cookie = (role: Role) => [{ name: "sid", value: who[role].sid, domain: host, path: "/" }];
	const contexts: BrowserContext[] = [];
	const open = async (role: Role | "visitor") => {
		const next = await browser.newContext({
			baseURL,
			viewport: VIEWPORT,
			deviceScaleFactor: 2,
			isMobile: true,
			hasTouch: true,
			colorScheme: "light",
		});
		if (role !== "visitor") await next.addCookies(cookie(role));
		contexts.push(next);
		return { context: next, page: await next.newPage() };
	};
	const { context, page } = await open("actor");
	const stamp = Date.now().toString(36).slice(-4);
	const undo: (() => Promise<unknown>)[] = [];
	const api: APIRequestContext = context.request;
	const routes: [string | RegExp, Parameters<Page["route"]>[1]][] = [];

	const scene: Scene = {
		page,
		context,
		baseURL,
		role: "actor",
		name: (text) => `${text} ${stamp}`,
		async goto(path) {
			await scene.page.goto(`/photos${path.startsWith("/") ? path : `/${path}`}`);
		},
		async signInAs(role) {
			const next = await open(role);
			for (const [url, handler] of routes) await next.page.route(url, handler);
			scene.context = next.context;
			scene.page = next.page;
			scene.role = role;
		},
		async call(method, args = {}, role = "actor") {
			const session = who[role];
			const response = await api.post(`/api/method/${method}`, {
				data: args,
				headers: { "X-Frappe-CSRF-Token": session.csrf, cookie: `sid=${session.sid}` },
			});
			if (!response.ok()) throw new Error(`${method} failed: ${response.status()} ${(await response.text()).slice(0, 300)}`);
			return ((await response.json()) as { message: never }).message;
		},
		defer(fn) {
			undo.push(fn);
		},
		async hold(url) {
			const held: Route[] = [];
			let status: number | null = null;
			let passing = false;
			const fail = (route: Route) =>
				route.fulfill({
					status: status ?? 500,
					contentType: "application/json",
					body: JSON.stringify({ exc_type: "ServerError", message: "Something went wrong" }),
				});
			const handler = async (route: Route) => {
				if (passing) await route.continue();
				else if (status === null) held.push(route);
				else await fail(route);
			};
			routes.push([url, handler]);
			await scene.page.route(url, handler);
			return {
				async release() {
					passing = true;
					await Promise.all(held.splice(0).map((route) => route.continue().catch(() => undefined)));
				},
				async abort(next = 500) {
					status = next;
					await Promise.all(held.splice(0).map((route) => fail(route).catch(() => undefined)));
				},
			};
		},
		async longPress(target, ms = 600) {
			const box = await target.boundingBox();
			if (!box) throw new Error("longPress target is not on screen");
			const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			const cdp = await scene.context.newCDPSession(scene.page);
			await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
			await scene.page.waitForTimeout(ms);
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await cdp.detach();
		},
		async settle(ms = SETTLE_MS) {
			await scene.page
				.waitForFunction(
					() =>
						Array.from(document.images).every((image) => {
							const box = image.getBoundingClientRect();
							const onScreen = box.width > 0 && box.bottom > 0 && box.top < innerHeight;
							return !onScreen || (image.complete && image.naturalWidth > 0);
						}),
					undefined,
					{ timeout: 15_000 },
				)
				.catch(() => undefined);
			await scene.page.waitForTimeout(ms);
		},
		async close() {
			for (const fn of undo.reverse()) await fn().catch((error) => console.warn(`[${label}] undo failed`, error));
			for (const each of contexts) await each.close();
		},
	};
	return scene;
}
