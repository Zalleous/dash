import { place, type Layout, type Rect } from '#lib/layout.ts';

/* A panel is a folder here: meta.ts says what it is, <Kind>.svelte draws it (its own tile, polls and Ctrl+K
   entries), and an optional data.server.ts serves its data. Folders are found on their own; nothing else names
   them. home: the kind's spot on the full board; without one it takes the first free spot. bare: no sheet and no
   title strip. glance: false keeps it out of the glance preset. many: edit mode can add more of it (<kind>-2,
   <kind>-3…). settings: each key's default, which also picks its field: a string a text field, a number a number
   field, a list a choice (its first item the default). Secrets stay in the env, never in settings. */
export type Setting = string | number | string[];
export type Settings = Record<string, string | number>;
export type Meta = { title: string; home?: Rect; bare?: boolean; glance?: false; many?: true; settings?: Record<string, Setting> };

/* A panel on the board. Each kind has a built-in one whose id is the kind's name; added ones are <kind>-<n>. */
export type Instance = { id: string; kind: string; settings: Settings };

export const META: Record<string, Meta> = Object.fromEntries(
	Object.entries(import.meta.glob<Meta>('./*/meta.ts', { eager: true, import: 'default' })).map(([path, meta]) => [path.split('/')[1], meta])
);

/* A kind's view file: its folder name in PascalCase, so my-thing/ holds MyThing.svelte (scripts/panel.ts too). */
export const viewFile = (kind: string) => `${kind.replace(/(?:^|-)(.)/g, (_, c: string) => c.toUpperCase())}.svelte`;

/* Bare tiles first, then column by column from their homes, then the kinds with no home in folder order. Later
   tiles paint over the edges of earlier ones (the registration crosses), so this order is part of the look. */
const kinds = Object.keys(META);
export const IDS = [
	...kinds
		.filter((id) => META[id].home)
		.sort((a, b) => {
			const [p, q] = [META[a], META[b]];
			return Number(!p.bare) - Number(!q.bare) || p.home!.x - q.home!.x || p.home!.y - q.home!.y;
		}),
	...kinds.filter((id) => !META[id].home)
];

/* The full board: every kind at home. The bare tiles fill the top 18 rows: the clock, now and next and the weather
   down the left, the car beside them and the title block under its right end. Under them, four columns of panels,
   6 cells each. A kind with no home takes the first free 6 x 6 spot, after the kinds with one (they come first in ids). */
export function full(ids: string[], metas: Record<string, Meta>) {
	const all: Layout = {};
	for (const id of ids) all[id] = metas[id].home ?? place(all, 6, 6);
	return all;
}

export const ALL = full(IDS, META);

/* A value fit for a setting with default d: one of its choices, or of its type, a string being 1 to 100 characters
   (0 to 100 when the default is empty) and a number finite. */
export const fit = (d: Setting, v: unknown) =>
	Array.isArray(d) ? d.includes(v as string) : typeof v === typeof d && (typeof v === 'number' ? Number.isFinite(v) : ((v as string).length > 0 || d === '') && (v as string).length <= 100);

/* An instance's settings: the stored values that still fit, the defaults for the rest. */
export const settle = (kind: string, stored: Record<string, unknown> = {}): Settings =>
	Object.fromEntries(Object.entries(META[kind].settings ?? {}).map(([k, d]) => [k, fit(d, stored[k]) ? (stored[k] as string | number) : Array.isArray(d) ? d[0] : d]));

/* A source's URL for an instance: ?i= names an added one; a built-in one keeps the plain URL. The first data in the
   page (+page.server.ts) uses the same text after /api/ as its key. */
export const api = (source: string, id: string) => `/api/${source}${id in META ? '' : `?i=${id}`}`;
