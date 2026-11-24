import { error, json } from '@sveltejs/kit';
import { msg } from '#lib/msg.ts';
import { instance } from '#lib/server/sources/presets.ts';
import { actions, kinds, sources } from '#lib/server/sources/index.ts';
import type { RequestHandler } from './$types';

const fail = (e: unknown, status: number) => json({ error: msg(e) }, { status });

/* Settings come from the DB, never from the request: ?i= names an instance, which must be of the source's kind;
   without it a panel's source runs for its kind's built-in instance. */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!Object.hasOwn(sources, params.source)) error(404);
	const source = sources[params.source];
	const i = url.searchParams.get('i');
	const kind = kinds[params.source];
	const id = i ?? kind;
	const p = id ? instance(id) : undefined;
	if (i !== null && !p) return fail('no such panel', 404);
	if (i !== null && p?.kind !== kind) return fail(`${params.source} is not a source of ${i}`, 400);
	try {
		return json(await source(p?.settings ?? {}));
	} catch (e) {
		return fail(e, 502);
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	if (!Object.hasOwn(actions, params.source)) error(404);
	const action = actions[params.source];
	try {
		return json(await action(await request.json()));
	} catch (e) {
		return fail(e, 400);
	}
};
