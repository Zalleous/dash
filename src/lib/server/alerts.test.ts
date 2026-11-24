import { expect, test } from 'vitest';
import { compose } from '#lib/server/alerts.ts';

const now = Date.parse('2026-10-12T21:00:00-04:00');
const fresh = new Date(now - 60_000).toISOString();
const ok = {
	vpn: { ok: true, status: 'OK', leak: false, bad: [], exit: 'Netherlands', checked: fresh },
	threat: { status: 'CLEAN', total: 3, last: 'old.exe', scanned: fresh }
};

test('quiet when everything is fine', () => {
	expect(compose({ down: [], guards: ok, truenas: [{ name: 'tank', status: 'ONLINE', healthy: true, used: 40 }], glances: { temp: 41, warn: 94 }, todos: { cards: [{ due: '2026-10-12' }, { due: null }] }, now, today: '2026-10-12' })).toEqual([]);
});

test('each problem raises one alert', () => {
	const out = compose({
		down: ['Gitea', '102 NeoforgeTest'],
		guards: {
			vpn: { ...ok.vpn, ok: false, leak: true, bad: ['qbittorrent'], checked: new Date(now - 30 * 60_000).toISOString() },
			threat: { status: 'INFECTED', total: 2, last: 'evil.exe', scanned: fresh }
		},
		truenas: [
			{ name: 'tank', status: 'ONLINE', healthy: true, used: 91.4 },
			{ name: 'boot', status: 'DEGRADED', healthy: false, used: 10 }
		],
		glances: { temp: 95, warn: 94 },
		todos: { cards: [{ due: '2026-10-11' }, { due: '2026-10-01' }, { due: '2026-10-12' }] },
		queue: [{ title: 'Frieren S02E03', bad: true }, { title: 'Dune', bad: false }],
		runs: [{ repo: 'dash', status: 'failure', href: '' }, { repo: 'ActionsTest', status: 'success', href: '' }],
		now,
		today: '2026-10-12'
	});
	expect(out.map((a) => [a.level, a.text])).toEqual([
		['red', 'Gitea down'],
		['red', '102 NeoforgeTest down'],
		['red', 'VPN LEAK · qbittorrent'],
		['red', 'AV INFECTED: evil.exe'],
		['yellow', 'media guards stale'],
		['yellow', 'pool tank 91% full'],
		['red', 'pool boot DEGRADED'],
		['yellow', 'cpu 95°C'],
		['yellow', '2 overdue todos'],
		['red', 'dash CI failed'],
		['yellow', 'download stuck: Frieren S02E03']
	]);
	expect(out[0].href).toBe('https://gitea.example.lan');
});
