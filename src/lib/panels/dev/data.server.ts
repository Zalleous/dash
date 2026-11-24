import { cached, giteaApi } from '#lib/server/http.ts';

const DAY = 86_400_000;

/* One row per repo with work in the last 7 days, newest first: its latest commit (those whose message starts with
   skip left out) and how many others landed in the last 24 h.
   ponytail: Gitea keeps at most 5 commits per push (FEED_MAX_COMMIT_NUM) and the fetch reads 50 feeds per repo, so `more`
   undercounts past that. */
export const repos = (feeds: any[], now: number, skip = '') => {
	const items = feeds
		.flatMap((a) => {
			const base = { repo: a.repo.name as string, at: a.created as string, href: a.repo.html_url as string };
			if (a.op_type !== 'commit_repo') return [{ ...base, text: `${a.op_type.replaceAll('_', ' ')} ${a.ref_name?.replace(/^refs\/\w+\//, '') ?? ''}`.trim() }];
			return ((JSON.parse(a.content || '{}').Commits ?? []) as any[]).map((c) => ({ ...base, text: c.Message.split('\n')[0] as string, href: `${base.href}/commit/${c.Sha1}` }));
		})
		.filter((i) => !(skip && i.text.startsWith(skip)) && now - Date.parse(i.at) < 7 * DAY)
		.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
	return [...Map.groupBy(items, (i) => i.repo).values()].map(([top, ...rest]) => ({ ...top, more: rest.filter((i) => now - Date.parse(i.at) < DAY).length }));
};

/* The feeds and the CI runs, fetched once for every reader (the alerts read the runs). */
export const raw = () =>
	cached('gitea', 120_000, async () => {
		const api = (path: string) => giteaApi(`/api/v1/${path}`);
		const list: any[] = await api('user/repos?limit=50');
		const [feeds, tasks] = await Promise.all([
			Promise.all(list.map((r) => api(`repos/${r.full_name}/activities/feeds?limit=50`))),
			Promise.all(list.map((r) => api(`repos/${r.full_name}/actions/tasks?limit=1`)))
		]);
		const runs = tasks.flatMap((t, i) => {
			const run = t.workflow_runs?.[0];
			return run ? [{ repo: list[i].name as string, status: run.status as string, title: run.display_title as string, at: run.updated_at as string, href: `${list[i].html_url}/actions/runs/${run.run_number}` }] : [];
		});
		return { feeds: feeds.flat(), runs };
	});

/* skip is the dev panel's setting (meta.ts). */
export const gitea = async ({ skip }: { skip: string }) => {
	const { feeds, runs } = await raw();
	return { activity: repos(feeds, Date.now(), skip), runs };
};

export const sources = { gitea };
