import { pad2 } from '#lib/time.ts';

/* The board is a grid of 24 fluid columns and 24 px rows; every panel is a tile on it, placed in whole cells. */
export const COLS = 24;
export const ROW = 24; // px
const ROWS = 100; // the deepest a tile may reach, so that a stored layout stays sane

export type Rect = { x: number; y: number; w: number; h: number };
export type Layout = Record<string, Rect>;

export const area = (r: Rect) => `${r.y + 1} / ${r.x + 1} / span ${r.h} / span ${r.w}`;

/* Tiles that only touch along an edge do not overlap. */
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function fits(layout: Layout) {
	const rects = Object.values(layout);
	return rects.every(
		(r, i) =>
			[r.x, r.y, r.w, r.h].every(Number.isInteger) &&
			r.x >= 0 &&
			r.y >= 0 &&
			r.w >= 1 &&
			r.h >= 1 &&
			r.x + r.w <= COLS &&
			r.y + r.h <= ROWS &&
			rects.slice(i + 1).every((o) => !overlaps(r, o))
	);
}

/* Detail numbers, 01 up: the shown tiles that have a title strip, column by column (x, then y), the order the phone
   stacks them in. */
export function numbers(layout: Layout, metas: Record<string, { bare?: boolean }>) {
	const ids = Object.keys(layout)
		.filter((id) => !metas[id]?.bare)
		.sort((a, b) => layout[a].x - layout[b].x || layout[a].y - layout[b].y);
	return Object.fromEntries(ids.map((id, i) => [id, pad2(i + 1)]));
}

/* A layout from the network: known panels only (ids), each a whole rect, fitting. Anything else is null. */
export function parse(input: unknown, ids: string[]): Layout | null {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
	const out: Layout = {};
	for (const [id, r] of Object.entries(input)) {
		if (!ids.includes(id) || !r || typeof r !== 'object') return null;
		const { x, y, w, h } = r as Rect;
		out[id] = { x, y, w, h };
	}
	return fits(out) ? out : null;
}

/* The first free spot for a w x h tile, reading the board top down and left to right. */
export function place(layout: Layout, w: number, h: number): Rect {
	for (let y = 0; ; y++)
		for (let x = 0; x + w <= COLS; x++) {
			const r = { x, y, w, h };
			if (Object.values(layout).every((o) => !overlaps(r, o))) return r;
		}
}
