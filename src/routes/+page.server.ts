import { api } from '#lib/panels/index.ts';
import { panels } from '#lib/server/sources/presets.ts';
import { kinds, sources } from '#lib/server/sources/index.ts';
import type { PageServerLoad } from './$types';

/* Renders the first data into the page, so a panel shows its data from the first paint instead of filling in
   after the boot. A source slower than 300 ms is left out, and its poll fetches it from the browser
   (poll.svelte.ts). A panel's source runs once per instance of its kind, keyed as its poll asks (api()); a shared
   one once. */
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(r, ms))]);

export const load: PageServerLoad = async () => {
	const all = panels();
	const calls = Object.entries(sources).flatMap(([name, source]) => {
		const mine = all.filter((p) => p.kind === kinds[name]);
		return mine.length ? mine.map((p) => [api(name, p.id).slice('/api/'.length), () => source(p.settings)] as const) : [[name, () => source({})] as const];
	});
	const values = await Promise.all(calls.map(([, call]) => within(call().catch(() => undefined), 300)));
	const first: Record<string, unknown> = {};
	calls.forEach(([key], i) => {
		if (values[i] !== undefined) first[key] = JSON.parse(JSON.stringify(values[i]));
	});
	return { first };
};
