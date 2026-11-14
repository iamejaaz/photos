import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

export const USERS = {
	actor: "demo@example.com",
	peer: "priya@example.com",
	fresh: "arjun@example.com",
} as const;

export interface Session {
	email: string;
	sid: string;
	csrf: string;
}

export const statePath = resolve(__dirname, ".state/sessions.json");

export default async function globalSetup(config: FullConfig): Promise<void> {
	const bench = process.env.E2E_BENCH_PATH ?? resolve(__dirname, "../../../..");
	const site = process.env.E2E_SITE ?? "suite.localhost";
	const baseURL = config.projects[0]?.use.baseURL as string;
	const sessions: Record<string, Session> = {};
	for (const [role, email] of Object.entries(USERS)) {
		const out = execFileSync(
			resolve(bench, "env/bin/python"),
			["-m", "frappe.utils.bench_helper", "frappe", "--site", site, "browse", "--user", email, "--sid"],
			{ cwd: resolve(bench, "sites"), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const sid = out.trim().split("\n").pop()?.trim() ?? "";
		const html = await (await fetch(`${baseURL}/photos/`, { headers: { cookie: `sid=${sid}` } })).text();
		const csrf = html.match(/csrf_token = '([^']+)'/)?.[1];
		if (!sid || !csrf) throw new Error(`Could not open a session for ${email}`);
		sessions[role] = { email, sid, csrf };
	}
	mkdirSync(resolve(__dirname, ".state"), { recursive: true });
	const temp = `${statePath}.${process.pid}`;
	writeFileSync(temp, JSON.stringify(sessions, null, "\t"));
	renameSync(temp, statePath);
}
