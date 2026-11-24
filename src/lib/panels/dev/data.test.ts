import { describe, expect, it } from 'vitest';
import { repos } from '#lib/panels/dev/data.server.ts';

const now = Date.parse('2026-11-17T20:00:00Z');
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const push = (repo: string, h: number, ...msgs: string[]) => ({
	repo: { name: repo, html_url: `https://git/${repo}` },
	created: ago(h),
	op_type: 'commit_repo',
	content: JSON.stringify({ Commits: msgs.map((m, i) => ({ Sha1: `${repo}${h}${i}`, Message: `${m}\n\nbody` })) })
});

describe('repos', () => {
	it('keeps one row per repo, newest first, skipping the commits that start with skip', () => {
		const feeds = [push('brain', 0.1, 'brain: sync laptop'), push('dash', 0.3, 'Compact media'), push('brain', 1, 'dash: done TP2'), push('brain', 2, 'brain: sync laptop')];
		const rows = repos(feeds, now, 'brain: sync');
		expect(rows.map((r) => [r.repo, r.text, r.more])).toEqual([
			['dash', 'Compact media', 0],
			['brain', 'dash: done TP2', 0]
		]);
		expect(rows[0].href).toBe('https://git/dash/commit/dash0.30');
		expect(repos(feeds, now, '').find((r) => r.repo === 'brain')?.text).toBe('brain: sync laptop');
	});

	it('counts the other commits of the last 24 h, every commit of a push', () => {
		const [row] = repos([push('dash', 1, 'Newest', 'Older'), push('dash', 5, 'Third'), push('dash', 30, 'Yesterday')], now);
		expect([row.text, row.more]).toEqual(['Newest', 2]);
	});

	it('drops repos quiet for 7 days and keeps other ops', () => {
		const branch = { repo: { name: 'nav', html_url: 'https://git/nav' }, created: ago(3), op_type: 'create_branch', ref_name: 'refs/heads/phone/x', content: '' };
		const rows = repos([push('old', 24 * 8, 'Ancient'), branch], now);
		expect(rows.map((r) => [r.repo, r.text, r.href])).toEqual([['nav', 'create branch phone/x', 'https://git/nav']]);
	});
});
