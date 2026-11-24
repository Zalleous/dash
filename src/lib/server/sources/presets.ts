import { db, tx } from '#lib/server/db.ts';
import { parse, type Layout } from '#lib/layout.ts';
import { IDS, META, fit, settle, type Instance, type Setting } from '#lib/panels/index.ts';

/* Keys 1 to 9 pick a preset by place, so there are nine at most; every load opens on the first. Any of them can
   move, glance too, but glance cannot go (db.ts would seed it back). The panels come along: every preset places
   the same instances. */
export async function presets() {
	const rows = db.prepare('SELECT name, layout FROM presets ORDER BY pos').all() as { name: string; layout: string }[];
	return { presets: rows.map((r) => ({ name: r.name, layout: JSON.parse(r.layout) as Layout })), panels: panels() };
}

/* Every instance: each kind's built-in one (a row with its id holds its settings), then the added ones in the order
   they came. A row whose kind's folder is gone stays out. */
export function panels(): Instance[] {
	const rows = db.prepare('SELECT id, kind, settings FROM panels ORDER BY rowid').all() as { id: string; kind: string; settings: string }[];
	const stored = (id: string) => JSON.parse(rows.find((r) => r.id === id)?.settings ?? '{}');
	return [...IDS.map((kind) => ({ id: kind, kind })), ...rows.filter((r) => r.id !== r.kind && META[r.kind])].map(({ id, kind }) => ({ id, kind, settings: settle(kind, stored(id)) }));
}

export const instance = (id: string) => panels().find((p) => p.id === id);

const want = (d: Setting) => (Array.isArray(d) ? `one of ${d.join(', ')}` : typeof d === 'number' ? 'a number' : d ? '1 to 100 characters' : 'at most 100 characters');

export async function presetsAction(body: Record<string, unknown>) {
	if (body.op === 'order') {
		/* The new order: every stored name once, nothing else. */
		const names = body.names;
		const known = (db.prepare('SELECT name FROM presets').all() as { name: string }[]).map((r) => r.name);
		if (!Array.isArray(names) || names.length !== known.length || !known.every((n) => names.includes(n))) throw new Error('bad order');
		tx(() => names.forEach((n, i) => db.prepare('UPDATE presets SET pos = ? WHERE name = ?').run(i, n)));
		return presets();
	}
	if (body.op === 'new') {
		/* Another instance of a kind that allows it, with the lowest free number. */
		const kind = String(body.kind);
		if (!META[kind]?.many) throw new Error(`no second ${kind}`);
		const taken = panels().map((p) => p.id);
		let n = 2;
		while (taken.includes(`${kind}-${n}`)) n++;
		db.prepare("INSERT INTO panels VALUES (?, ?, '{}')").run(`${kind}-${n}`, kind);
		return { ...(await presets()), id: `${kind}-${n}` };
	}
	if (body.op === 'set') {
		/* Known keys only, each fit for its default (strings trimmed first). */
		const p = instance(String(body.id));
		if (!p) throw new Error('no such panel');
		const defaults = META[p.kind].settings ?? {};
		if (!body.settings || typeof body.settings !== 'object') throw new Error('bad settings');
		const next = { ...p.settings };
		for (let [k, v] of Object.entries(body.settings)) {
			if (!Object.hasOwn(defaults, k)) throw new Error(`${p.kind} has no setting ${k}`);
			if (typeof v === 'string') v = v.trim();
			if (!fit(defaults[k], v)) throw new Error(`${k}: ${want(defaults[k])}`);
			next[k] = v as string | number;
		}
		db.prepare('INSERT INTO panels VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET settings = excluded.settings').run(p.id, p.kind, JSON.stringify(next));
		return presets();
	}
	if (body.op === 'drop') {
		/* An added instance goes from the panels and from every preset at once. */
		const id = String(body.id);
		if (id in META) throw new Error(`${id} is built in`);
		if (!instance(id)) throw new Error('no such panel');
		tx(() => {
			db.prepare('DELETE FROM panels WHERE id = ?').run(id);
			db.prepare('UPDATE presets SET layout = json_remove(layout, ?)').run(`$."${id}"`);
		});
		return presets();
	}
	const name = String(body.name ?? '').trim();
	if (!name || name.length > 30) throw new Error('a preset name is 1 to 30 characters');
	if (body.op === 'delete') {
		if (name === 'glance') throw new Error('glance stays');
		db.prepare('DELETE FROM presets WHERE name = ?').run(name);
	} else if (body.op === 'save') {
		const layout = parse(body.layout, panels().map((p) => p.id));
		if (!layout) throw new Error('bad layout');
		const known = db.prepare('SELECT 1 FROM presets WHERE name = ?').get(name);
		if (!known && (db.prepare('SELECT COUNT(*) AS n FROM presets').get() as { n: number }).n >= 9) throw new Error('nine presets at most');
		db.prepare('INSERT INTO presets VALUES (?, (SELECT MAX(pos) + 1 FROM presets), ?) ON CONFLICT (name) DO UPDATE SET layout = excluded.layout').run(name, JSON.stringify(layout));
	} else throw new Error('bad preset op');
	return presets();
}
