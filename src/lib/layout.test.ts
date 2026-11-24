import { expect, test } from 'vitest';
import { fits, numbers, overlaps, parse, place } from '#lib/layout.ts';

const ids = ['todo', 'dev'];

test('touching tiles do not overlap', () => {
	const a = { x: 0, y: 0, w: 6, h: 4 };
	expect(overlaps(a, { x: 6, y: 0, w: 6, h: 4 })).toBe(false);
	expect(overlaps(a, { x: 0, y: 4, w: 6, h: 4 })).toBe(false);
	expect(overlaps(a, { x: 5, y: 3, w: 6, h: 4 })).toBe(true);
	expect(overlaps(a, { x: 1, y: 1, w: 1, h: 1 })).toBe(true);
});

test('fits rejects overlaps, overflow and fractions', () => {
	expect(fits({ todo: { x: 0, y: 0, w: 6, h: 4 }, dev: { x: 3, y: 2, w: 6, h: 4 } })).toBe(false);
	expect(fits({ todo: { x: 20, y: 0, w: 6, h: 4 } })).toBe(false);
	expect(fits({ todo: { x: 0, y: 0, w: 6.5, h: 4 } })).toBe(false);
	expect(fits({ todo: { x: 0, y: -1, w: 6, h: 4 } })).toBe(false);
	expect(fits({})).toBe(true);
});

test('parse keeps a valid layout and drops extra fields', () => {
	expect(parse({ todo: { x: 0, y: 0, w: 6, h: 4, z: 9 } }, ids)).toEqual({ todo: { x: 0, y: 0, w: 6, h: 4 } });
	expect(parse({}, ids)).toEqual({});
});

test('parse rejects unknown panels, bad rects and overlaps', () => {
	expect(parse({ nope: { x: 0, y: 0, w: 6, h: 4 } }, ids)).toBe(null);
	expect(parse({ todo: { x: '0', y: 0, w: 6, h: 4 } }, ids)).toBe(null);
	expect(parse({ todo: null }, ids)).toBe(null);
	expect(parse({ todo: { x: 0, y: 99, w: 6, h: 4 } }, ids)).toBe(null);
	expect(parse({ todo: { x: 0, y: 0, w: 6, h: 4 }, dev: { x: 3, y: 2, w: 6, h: 4 } }, ids)).toBe(null);
	expect(parse([], ids)).toBe(null);
	expect(parse('x', ids)).toBe(null);
});

test('place finds the first free spot', () => {
	expect(place({}, 6, 4)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
	expect(place({ todo: { x: 0, y: 0, w: 6, h: 4 } }, 6, 4)).toEqual({ x: 6, y: 0, w: 6, h: 4 });
	expect(place({ todo: { x: 0, y: 0, w: 24, h: 4 } }, 6, 4)).toEqual({ x: 0, y: 4, w: 6, h: 4 });
});

test('numbers run column by column through the tiles with a strip', () => {
	const layout = {
		media: { x: 18, y: 0, w: 6, h: 4 },
		agenda: { x: 6, y: 0, w: 6, h: 4 },
		todo: { x: 0, y: 4, w: 6, h: 4 },
		deadlines: { x: 0, y: 8, w: 6, h: 4 },
		clock: { x: 0, y: 0, w: 6, h: 4 }
	};
	const n = numbers(layout, { clock: { bare: true } });
	expect(n).toEqual({ todo: '01', deadlines: '02', agenda: '03', media: '04' });
	expect(n.dev).toBeUndefined();
});
