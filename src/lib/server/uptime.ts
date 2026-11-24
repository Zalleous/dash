import { links } from '#lib/server/links.ts';
import { db, tx } from '#lib/server/db.ts';
import { TIMEOUT } from '#lib/server/http.ts';
import { proxmox } from '#lib/panels/homelab/data.server.ts';

const DAY = 86_400_000;
const STEP = 15 * 60_000;
const probes = links.filter((l) => l.group !== 'web').map((l) => [l.name, l.check ?? l.href] as const);

const ping = (url: string) =>
	fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) }).then(
		(r) => (r.body?.cancel(), r.status < 500 ? 1 : 0),
		() => 0
	);

async function tick() {
	const ts = Date.now();
	const guests = await proxmox().then(
		(p) => p.guests.map((g) => [`${g.id} ${g.name}`, g.status === 'running' ? 1 : 0] as const),
		() => []
	);
	const services = await Promise.all(probes.map(async ([name, url]) => [name, await ping(url)] as const));
	const insert = db.prepare('INSERT INTO uptime VALUES (?, ?, ?)');
	tx(() => {
		for (const [name, up] of [...guests, ...services]) insert.run(name, ts, up);
		db.prepare('DELETE FROM uptime WHERE ts < ?').run(ts - 7 * DAY);
	});
}

export function startUptime() {
	const g = globalThis as { uptimeTimer?: ReturnType<typeof setInterval> };
	const run = () => tick().catch((e) => console.error('uptime:', e));
	clearInterval(g.uptimeTimer);
	g.uptimeTimer = setInterval(run, 60_000).unref();
	run();
}

export function strips() {
	const from = Date.now() - DAY;
	const rows = db
		.prepare("SELECT CASE WHEN service GLOB '[0-9]*' THEN 'guests' ELSE service END AS service, CAST((ts - ?) / ? AS INTEGER) AS b, AVG(up) AS up FROM uptime WHERE ts >= ? AND (service NOT GLOB '[0-9]*' OR service IN (SELECT service FROM uptime WHERE up = 1 AND ts >= ?)) GROUP BY 1, b ORDER BY 1 COLLATE NOCASE")
		.all(from, STEP, from, from) as { service: string; b: number; up: number }[];
	const out = new Map<string, (number | null)[]>();
	for (const r of rows) {
		if (!out.has(r.service)) out.set(r.service, Array(96).fill(null));
		out.get(r.service)![Math.min(r.b, 95)] = r.up;
	}
	return { from, step: STEP, services: [...out].map(([name, buckets]) => ({ name, buckets })) };
}

export function down() {
	const rows = db
		.prepare('SELECT service FROM uptime WHERE up = 0 AND ts = (SELECT MAX(ts) FROM uptime) AND service IN (SELECT service FROM uptime WHERE up = 1 AND ts > ?)')
		.all(Date.now() - DAY) as { service: string }[];
	return rows.map((r) => r.service);
}
