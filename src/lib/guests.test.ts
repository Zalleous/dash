import { expect, test } from 'vitest';
import { EVERY, init, turn, update, type Rotation, type Guest } from '#lib/guests.ts';

const g = (id: number, o: Partial<Guest> = {}): Guest => ({ id, name: `g${id}`, type: 'lxc', status: 'running', cpu: 1, mem: 10, ...o });
const lab = (n: number, o: Record<number, Partial<Guest>> = {}) => Array.from({ length: n }, (_, i) => g(i + 1, o[i + 1]));
const unique = (s: Rotation) => expect(new Set(s.shown).size).toBe(s.shown.length);
const first = () => () => 0;

test('first page and turns wrap in id order', () => {
	let s = init(lab(5), 0);
	expect(s.shown).toEqual([1, 2, 3]);
	expect(s.span).toEqual([1, 3]);
	expect(s.turnAt).toBe(EVERY);
	s = turn(s, 100);
	expect(s.shown).toEqual([4, 5, 1]);
	expect(s.span).toEqual([4, 1]);
	expect(s.turnAt).toBe(100 + EVERY);
	unique(s);
});

test('a move of 1 point bumps a hidden guest into a slot; less does not', () => {
	const s = init(lab(12), 0);
	const quiet = update(s, lab(12, { 7: { cpu: 1.9 } }), 10, false, first());
	expect(quiet.shown).toEqual([1, 2, 3]);
	expect(quiet.delta).toEqual({});
	expect(quiet.turnAt).toBe(EVERY);
	const moved = update(s, lab(12, { 7: { cpu: 2 } }), 10, false, first());
	expect(moved.shown).toContain(7);
	expect(moved.delta[7]).toEqual({ cpu: 1 });
	expect(moved.bumped).toEqual([7]);
	expect(turn(moved, 20).bumped).toEqual([]);
	expect(moved.turnAt).toBe(10 + EVERY);
});

test('a visible guest that moves keeps its slot and gets its delta', () => {
	const s = update(init(lab(12), 0), lab(12, { 2: { mem: 4 } }), 10, false, first());
	expect(s.shown).toEqual([1, 2, 3]);
	expect(s.delta[2]).toEqual({ mem: -6 });
	expect(s.turnAt).toBe(EVERY);
});

test('the bag uses every slot once before any repeats', () => {
	for (const r of [0, 0.5, 0.99]) {
		let s = init(lab(12), 0);
		const slots: number[] = [];
		for (const id of [7, 8, 9, 10]) {
			s = update(s, lab(12, { [id]: { cpu: 50 } }), 0, false, () => r);
			slots.push(s.shown.indexOf(id));
			unique(s);
			s = update(s, lab(12), 0, false, () => r);
		}
		expect(new Set(slots.slice(0, 3))).toEqual(new Set([0, 1, 2]));
	}
});

test('several moves: biggest first, the extras lead the next page', () => {
	const s = update(init(lab(12), 0), lab(12, { 7: { cpu: 6 }, 8: { cpu: 3 }, 9: { cpu: 11 }, 10: { cpu: 2 } }), 0, false, first());
	expect(new Set(s.shown)).toEqual(new Set([7, 8, 9]));
	expect(s.queue).toEqual([10]);
	expect(turn(s, 0).shown[0]).toBe(10);
});

test('while paused a move waits in the queue', () => {
	const s = update(init(lab(12), 0), lab(12, { 7: { cpu: 50 } }), 0, true, first());
	expect(s.shown).toEqual([1, 2, 3]);
	expect(s.queue).toEqual([7]);
});

test('cpu over the limit must hold two polls; it pins in front and unpins when fine', () => {
	let s = init(lab(12), 0);
	s = update(s, lab(12, { 6: { cpu: 95 } }), 0, false, first());
	expect(s.crit).toEqual([]);
	s = update(s, lab(12, { 6: { cpu: 95 } }), 0, false, first());
	expect(s.crit).toEqual([6]);
	expect(s.shown[0]).toBe(6);
	unique(s);
	s = turn(s, 0);
	expect(s.shown[0]).toBe(6);
	s = update(s, lab(12), 0, false, first());
	expect(s.crit).toEqual([]);
	expect(s.pool).toContain(6);
});

test('down is critical at once; a VM is never critical on mem', () => {
	const vm = lab(12, { 5: { status: 'paused' }, 9: { type: 'qemu', mem: 99 } });
	const s = update(init(vm, 0), vm, 0, false, first());
	expect(s.crit).toEqual([5]);
	expect(s.shown[0]).toBe(5);
	const ct = lab(12, { 9: { mem: 99 } });
	expect(update(update(s, ct, 0, false, first()), ct, 0, false, first()).crit).toEqual([9]);
});

test('a bump never replaces a pinned card', () => {
	let s = init(lab(12, { 12: { status: 'paused' } }), 0);
	for (const id of [5, 6, 7, 8]) {
		s = update(s, lab(12, { 12: { status: 'paused' }, [id]: { cpu: 40 } }), 0, false, () => 0.99);
		expect(s.shown[0]).toBe(12);
		unique(s);
	}
});

test('stopped guests are left out', () => {
	const s = init(lab(4, { 2: { status: 'stopped' } }), 0);
	expect(s.pool).toEqual([1, 3, 4]);
	expect(s.shown).toEqual([1, 3, 4]);
});

test('more critical guests than slots turn among themselves', () => {
	const bad = { status: 'paused' };
	let s = init(lab(8, { 1: bad, 3: bad, 5: bad, 7: bad }), 0);
	expect(s.pinned).toEqual([]);
	expect(s.shown).toEqual([1, 3, 5]);
	s = turn(s, 0);
	expect(s.shown).toEqual([7, 1, 3]);
});
