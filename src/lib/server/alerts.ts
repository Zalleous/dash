import { links } from '#lib/server/links.ts';
import type { glances, guards, truenas } from '#lib/panels/homelab/data.server.ts';
import type { Data } from '#lib/poll.svelte.ts';

export type Alert = { level: 'red' | 'yellow'; text: string; href?: string };

const STALE = 20 * 60_000;

export function compose(x: {
	down: string[];
	guards?: Data<typeof guards>;
	truenas?: Data<typeof truenas>;
	glances?: Data<typeof glances>;
	todos?: { cards: { due: string | null }[] };
	queue?: { title: string; bad: boolean }[];
	runs?: { repo: string; status: string; href: string }[];
	now: number;
	today: string;
}): Alert[] {
	const out: Alert[] = x.down.map((s) => ({ level: 'red', text: `${s} down`, href: links.find((l) => l.name === s)?.href }));
	if (x.guards) {
		const { vpn, threat } = x.guards;
		if (!vpn.ok) out.push({ level: 'red', text: [vpn.leak ? 'VPN LEAK' : `VPN ${vpn.status}`, ...vpn.bad].join(' · ') });
		if (threat.status !== 'CLEAN') out.push({ level: 'red', text: `AV ${threat.status}${threat.last ? ': ' + threat.last : ''}` });
		if (x.now - Math.min(Date.parse(vpn.checked), Date.parse(threat.scanned)) > STALE) out.push({ level: 'yellow', text: 'media guards stale' });
	}
	for (const p of x.truenas ?? []) {
		if (!p.healthy) out.push({ level: 'red', text: `pool ${p.name} ${p.status}` });
		else if (p.used > 85) out.push({ level: 'yellow', text: `pool ${p.name} ${Math.round(p.used)}% full` });
	}
	const { temp, warn } = x.glances ?? {};
	if (temp && warn && temp >= warn) out.push({ level: 'yellow', text: `cpu ${temp}°C` });
	const overdue = x.todos?.cards.filter((c) => c.due && c.due < x.today).length;
	if (overdue) out.push({ level: 'yellow', text: `${overdue} overdue todo${overdue > 1 ? 's' : ''}` });
	for (const r of x.runs ?? []) if (r.status === 'failure') out.push({ level: 'red', text: `${r.repo} CI failed`, href: r.href });
	const stuck = x.queue?.filter((q) => q.bad) ?? [];
	if (stuck.length) out.push({ level: 'yellow', text: stuck.length > 1 ? `${stuck.length} downloads stuck` : `download stuck: ${stuck[0].title}`, href: links.find((l) => l.name === 'qBittorrent')?.href });
	return out;
}
