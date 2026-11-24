import { db } from '#lib/server/db.ts';
import { projects } from '#lib/server/sources/vault.ts';

export async function timer() {
	const now = Date.now();
	const from = new Date(now);
	from.setHours(0, 0, 0, 0);
	from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
	const running = db.prepare('SELECT project, start FROM sessions WHERE "end" IS NULL').get() as { project: string; start: number } | undefined;
	const week = db
		.prepare('SELECT project, SUM(COALESCE("end", $now) - MAX(start, $from)) / 3600000.0 AS hours FROM sessions WHERE COALESCE("end", $now) > $from GROUP BY project ORDER BY hours DESC')
		.all({ now, from: +from }) as { project: string; hours: number }[];
	/* The panel's chips: the 5 projects started most recently, at any age. */
	const recent = (db.prepare('SELECT project FROM sessions GROUP BY project ORDER BY MAX(start) DESC LIMIT 5').all() as { project: string }[]).map((r) => r.project);
	return {
		running: running ?? null,
		week,
		recent,
		/* The week's goal: GOAL_HOURS (10 by default) on GOAL_PROJECT; none without a project. */
		goal: process.env.GOAL_PROJECT ? { project: process.env.GOAL_PROJECT, hours: Number(process.env.GOAL_HOURS || 10) } : null,
		projects: await projects().catch(() => [] as string[])
	};
}

export async function timerAction(body: Record<string, unknown>) {
	const project = String(body.project ?? '').trim().slice(0, 60);
	if (body.op !== 'stop' && (body.op !== 'start' || !project)) throw new Error('bad timer op');
	const now = Date.now();
	db.prepare('UPDATE sessions SET "end" = ? WHERE "end" IS NULL').run(now);
	if (body.op === 'start') db.prepare('INSERT INTO sessions (project, start) VALUES (?, ?)').run(project, now);
	return timer();
}
