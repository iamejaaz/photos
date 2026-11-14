import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:8031";

/** Reuses an installed headless Chromium when the matching one is not downloaded. */
function chromium(): string | undefined {
	if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
	const cache = resolve(homedir(), "Library/Caches/ms-playwright");
	if (!existsSync(cache)) return undefined;
	const shell = readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort().pop();
	return shell ? resolve(cache, shell, "chrome-headless-shell-mac-arm64/chrome-headless-shell") : undefined;
}

export const OUT_DIR = resolve(__dirname, "out");

export default defineConfig({
	testDir: __dirname,
	testMatch: /capture\.spec\.ts/,
	outputDir: resolve(__dirname, ".runs"),
	retries: 0,
	workers: 1,
	timeout: 20 * 60_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	use: {
		baseURL,
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
		launchOptions: { executablePath: chromium() },
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	globalSetup: "./global-setup.ts",
});
