import { describe, expect, it } from 'vitest';
import { drops, state } from '#lib/panels/media/data.server.ts';

const ep = (sub: string, has = true, title = 'Show', day = '2026-11-20') => ({ day, time: '03:00', title, sub, has });

describe('drops', () => {
	it('merges one show on one day into a range, keeps the rest and the order', () => {
		const drop = Array.from({ length: 8 }, (_, i) => ep(`S01E0${i + 1}`, i !== 4));
		const rows = drops([ep('S02E07', true, 'Early', '2026-11-19'), ...drop.reverse(), { ...ep('movie', false, 'Film'), time: '' }]);
		expect(rows.map((r) => [r.title, r.sub, r.has])).toEqual([
			['Early', 'S02E07', true],
			['Show', 'S01E01–E08', false],
			['Film', 'movie', false]
		]);
		expect(drops([ep('S01E10'), ep('S02E01')])[0].sub).toBe('S01E10–S02E01');
	});
});

describe('state', () => {
	const now = Date.parse('2026-11-17T12:00:00Z');
	const ago = (d: number) => ({ createdAt: new Date(now - d * 86_400_000).toISOString() });
	it('drops weekly airing shows and names the rest', () => {
		expect(state(ago(30), { status: 'Returning Series', nextEpisodeToAir: { airDate: '2026-11-20' } }, now)).toBeNull();
		expect(state(ago(50), { status: 'In Production', nextEpisodeToAir: { airDate: '2027-01-07' } }, now)).toBe('unreleased');
		expect(state(ago(74), { status: 'Ended', nextEpisodeToAir: null }, now)).toBe('stuck 74d');
		expect(state(ago(6), { status: 'Ended' }, now)).toBe('new 6d');
	});
	it('names a request waiting only on unaired seasons, keeps aired gaps stuck', () => {
		const tmdb = (s3: string | null) => ({
			status: 'Returning Series',
			nextEpisodeToAir: null,
			seasons: [{ seasonNumber: 2, airDate: '2024-01-08' }, { seasonNumber: 3, airDate: s3 }],
			mediaInfo: { seasons: [{ seasonNumber: 2, status: 5 }, { seasonNumber: 3, status: 3 }] }
		});
		const req = { ...ago(151), seasons: [{ seasonNumber: 2 }, { seasonNumber: 3 }] };
		expect(state(req, tmdb(null), now)).toBe('next S3');
		expect(state(req, tmdb('2027-04-01'), now)).toBe('next S3');
		expect(state(req, tmdb('2025-01-01'), now)).toBe('stuck 151d');
	});
});
