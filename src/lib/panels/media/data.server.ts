import { cached, service } from '#lib/server/http.ts';
import { isoDay, pad2 } from '#lib/time.ts';

const WEEK = 7 * 86_400_000;
const BAD = ['warning', 'failed', 'error'];
const ep = (e: any) => `S${pad2(e.seasonNumber)}E${pad2(e.episodeNumber)}`;

const apiKey = (key: string) => ({ 'X-Api-Key': key });
const sonarr = service('SONARR_URL', 'SONARR_KEY', apiKey);
const radarr = service('RADARR_URL', 'RADARR_KEY', apiKey);
const jellyseerr = service('JELLYSEERR_URL', 'JELLYSEERR_KEY', apiKey);
const jellyfinApi = service('JELLYFIN_URL', 'JELLYFIN_KEY', (key) => ({ Authorization: `MediaBrowser Token="${key}"` }));

type Row = { day: string; time: string; title: string; sub: string; has: boolean };

/* A season drop: one show's episodes on one day become one row with a range, S01E01–E08. */
export const drops = (rows: Row[]): Row[] =>
	[...Map.groupBy(rows, (r) => r.day + r.title).values()].map((g) => {
		if (g.length === 1) return g[0];
		const subs = g.map((r) => r.sub).sort();
		const [a, b] = [subs[0], subs.at(-1)!];
		return { ...g[0], sub: `${a}–${a.slice(0, 3) === b.slice(0, 3) ? b.slice(3) : b}`, has: g.every((r) => r.has) };
	});

const UNRELEASED = ['In Production', 'Planned', 'Post Production', 'Rumored', 'Pilot'];
const DAY = 86_400_000;
const AVAILABLE = 5;

type Season = { seasonNumber: number; airDate?: string | null; status?: number };

/* A request's state: null while a show airs weekly (this week lists it), else unreleased, next S<n> (only unaired seasons missing), new or stuck. */
export function state(
	r: { createdAt: string; seasons?: Season[] },
	m: { status?: string; nextEpisodeToAir?: { airDate?: string } | null; seasons?: Season[]; mediaInfo?: { seasons?: Season[] } | null },
	now: number
) {
	const next = m.nextEpisodeToAir?.airDate;
	if (next && Date.parse(next) - now <= 8 * DAY) return null;
	if (UNRELEASED.includes(m.status ?? '')) return 'unreleased';
	const have = new Set(m.mediaInfo?.seasons?.filter((s) => s.status === AVAILABLE).map((s) => s.seasonNumber));
	const missing = (r.seasons ?? []).map((s) => s.seasonNumber).filter((n) => !have.has(n));
	const aired = (n: number) => {
		const d = m.seasons?.find((s) => s.seasonNumber === n)?.airDate;
		return !!d && Date.parse(d) <= now;
	};
	if (missing.length && !missing.some(aired)) return `next S${Math.min(...missing)}`;
	const days = Math.floor((now - Date.parse(r.createdAt)) / DAY);
	return `${days >= 7 ? 'stuck' : 'new'} ${days}d`;
}

export const arr = () =>
	cached('arr', 30_000, async () => {
		const from = new Date();
		from.setHours(0, 0, 0, 0);
		const [start, end] = [from.toISOString(), new Date(+from + WEEK).toISOString()];
		const [episodes, movies, sq, rq] = await Promise.all([
			sonarr(`/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`),
			radarr(`/api/v3/calendar?start=${start}&end=${end}`),
			sonarr('/api/v3/queue?pageSize=100&includeSeries=true&includeEpisode=true'),
			radarr('/api/v3/queue?pageSize=100&includeMovie=true')
		]);
		const upcoming = drops([
			...episodes.map((e: any) => {
				const at = new Date(e.airDateUtc);
				return { day: isoDay(at), time: at.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), title: e.series.title, sub: ep(e), has: e.hasFile as boolean };
			}),
			...movies.flatMap((m: any) => {
				const day = [m.digitalRelease, m.physicalRelease, m.inCinemas].map((d) => d?.slice(0, 10)).filter((d) => d >= start.slice(0, 10) && d < end.slice(0, 10)).sort()[0];
				return day ? [{ day, time: '', title: m.title as string, sub: 'movie', has: m.hasFile as boolean }] : [];
			})
		].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)));
		const groups = Map.groupBy([...sq.records, ...rq.records] as any[], (q) => q.downloadId ?? q.id);
		const queue = [...groups.values()].map((g) => {
			const q = g[0];
			const size = g.reduce((n, x) => n + x.size, 0);
			const left = g.reduce((n, x) => n + x.sizeleft, 0);
			return {
				title: q.series ? `${q.series.title} ${g.length > 1 ? `S${pad2(q.episode.seasonNumber)} ×${g.length}` : ep(q.episode)}` : (q.movie?.title ?? q.title),
				pct: size ? 100 * (1 - left / size) : 0,
				eta: (q.estimatedCompletionTime ?? null) as string | null,
				state: (q.trackedDownloadState ?? q.status) as string,
				bad: BAD.includes(q.status) || BAD.includes(q.trackedDownloadStatus)
			};
		});
		return { upcoming, queue };
	});

export const jellyfin = () =>
	cached('jellyfin', 30_000, async () => {
		const user = await cached('jellyfin:user', 3_600_000, async () => {
			const users: any[] = await jellyfinApi('/Users');
			return (users.find((u) => u.Name === process.env.JELLYFIN_USER) ?? users.find((u) => u.Policy.IsAdministrator)).Id as string;
		});
		const [latest, sessions] = await Promise.all([jellyfinApi(`/Items/Latest?userId=${user}&limit=12`), jellyfinApi('/Sessions?activeWithinSeconds=600')]);
		return {
			latest: (latest as any[]).map((i) => ({ id: i.Id as string, name: (i.SeriesName ?? i.Name) as string, type: i.Type as string })),
			playing: sessions
				.filter((s: any) => s.NowPlayingItem)
				.map((s: any) => {
					const i = s.NowPlayingItem;
					return {
						user: s.UserName as string,
						title: (i.SeriesName ? `${i.SeriesName} · ${i.Name}` : i.Name) as string,
						pct: i.RunTimeTicks ? (100 * (s.PlayState.PositionTicks ?? 0)) / i.RunTimeTicks : 0,
						paused: !!s.PlayState.IsPaused
					};
				})
		};
	});

export const requests = () =>
	cached('requests', 60_000, async () => {
		const { results } = await jellyseerr('/api/v1/request?filter=processing&take=20');
		const now = Date.now();
		const out: { id: number; type: string; tmdb: number; title: string; state: string | null; age: number }[] = await Promise.all(
			results.map(async (r: any) => {
				const m = await jellyseerr(`/api/v1/${r.type}/${r.media.tmdbId}`);
				return { id: r.id, type: r.type, tmdb: r.media.tmdbId, title: m.title ?? m.name, state: state(r, m, now), age: Date.parse(r.createdAt) };
			})
		);
		/* Stuck first, oldest first; then new; unreleased and next season last. */
		const rank = (s: string) => (s.startsWith('stuck') ? 0 : s.startsWith('new') ? 1 : 2);
		return out
			.filter((r) => r.state !== null)
			.sort((a, b) => rank(a.state!) - rank(b.state!) || a.age - b.age)
			.map(({ age, ...r }) => ({ ...r, state: r.state! }));
	});

export const sources = { arr, jellyfin, requests };
