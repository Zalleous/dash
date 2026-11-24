/* The homelab guest carousel: a page of cards that turns on a timer. A guest whose cpu or mem moved takes one
   visible slot at once, the slot drawn from a shuffle bag. A critical guest is pinned in front until it is fine. */

export type Guest = { id: number; name: string; type: string; status: string; cpu: number; mem: number };
type Delta = { cpu?: number; mem?: number };

export const PAGE = 3;
export const EVERY = 8000;
/* Smallest move, in points since the last poll, that bumps a card. */
const BUMP = 1;
const CPU = 90;
const MEM = 95;
/* Polls in a row a cpu or mem limit must hold before the guest counts as critical. */
const POLLS = 2;

export type Rotation = {
	shown: number[];
	crit: number[];
	pinned: number[];
	pool: number[];
	cursor: number;
	span: [number, number] | null;
	bag: number[];
	queue: number[];
	hot: Record<number, number>;
	prev: Record<number, { cpu: number; mem: number }>;
	delta: Record<number, Delta>;
	/* Guests placed by a bump on the last poll: their cards plot in top down. */
	bumped: number[];
	turnAt: number;
};

const down = (g: Guest) => g.status !== 'running' && g.status !== 'stopped';
export const overCpu = (g: Guest) => g.status === 'running' && g.cpu >= CPU;
/* A VM's mem includes its page cache, so it never counts as over. */
export const overMem = (g: Guest) => g.status === 'running' && g.type !== 'qemu' && g.mem >= MEM;

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/* Fills the slots after `keep` from the queue, then from the pool at the cursor. `span` is the 1-based pool range taken. */
function fill(keep: number[], pool: number[], queue: number[], cursor: number) {
	const shown = keep.slice();
	const want = Math.min(PAGE, new Set([...keep, ...pool]).size);
	queue = queue.filter((id) => pool.includes(id) && !shown.includes(id));
	while (shown.length < want && queue.length) shown.push(queue.shift()!);
	let span: [number, number] | null = null;
	for (let n = 0; shown.length < want && n < pool.length; n++) {
		const i = cursor % pool.length;
		cursor = i + 1;
		if (shown.includes(pool[i])) continue;
		shown.push(pool[i]);
		span = [span?.[0] ?? i + 1, i + 1];
	}
	return { shown, queue, cursor, span };
}

export function turn(s: Rotation, now: number): Rotation {
	const f = fill(s.pinned, s.pool, s.queue, s.cursor);
	return { ...s, ...f, span: f.span ?? s.span, bumped: [], turnAt: now + EVERY };
}

export function update(s: Rotation, guests: Guest[], now: number, paused: boolean, rand: () => number): Rotation {
	const hot = Object.fromEntries(guests.map((g) => [g.id, overCpu(g) || overMem(g) ? (s.hot[g.id] ?? 0) + 1 : 0]));
	const crit = guests.filter((g) => down(g) || hot[g.id] >= POLLS).map((g) => g.id);
	/* More critical guests than slots: the carousel turns among them alone. */
	const pinned = crit.length > PAGE ? [] : crit;
	const pool = crit.length > PAGE ? crit : guests.filter((g) => g.status !== 'stopped' && !crit.includes(g.id)).map((g) => g.id);

	const delta: Record<number, Delta> = {};
	const moves: { id: number; size: number }[] = [];
	for (const g of guests) {
		const p = s.prev[g.id];
		if (!p || g.status !== 'running') continue;
		const d: Delta = {};
		if (Math.abs(g.cpu - p.cpu) >= BUMP) d.cpu = g.cpu - p.cpu;
		if (Math.abs(g.mem - p.mem) >= BUMP) d.mem = g.mem - p.mem;
		if (d.cpu === undefined && d.mem === undefined) continue;
		delta[g.id] = d;
		moves.push({ id: g.id, size: Math.max(Math.abs(d.cpu ?? 0), Math.abs(d.mem ?? 0)) });
	}

	/* Pinned cards lead; the others keep their order while still in the pool; holes fill from the queue and cursor. */
	const kept = [...pinned, ...s.shown.filter((id) => !pinned.includes(id) && pool.includes(id))].slice(0, PAGE);
	const f = fill(kept, pool, s.queue, s.cursor);
	const shown = f.shown;

	let bag = s.bag.filter((i) => i >= pinned.length && i < PAGE);
	const used: number[] = [];
	const extra: number[] = [];
	for (const { id } of moves.filter((m) => pool.includes(m.id) && !shown.includes(m.id)).sort((a, b) => b.size - a.size)) {
		const free = range(pinned.length, shown.length).filter((i) => !used.includes(i));
		if (paused || !free.length) {
			extra.push(id);
			continue;
		}
		if (!bag.some((i) => free.includes(i))) bag = range(pinned.length, PAGE);
		const options = bag.filter((i) => free.includes(i));
		const slot = options[Math.floor(rand() * options.length)];
		bag = bag.filter((i) => i !== slot);
		used.push(slot);
		shown[slot] = id;
	}

	return {
		shown,
		crit,
		pinned,
		pool,
		cursor: f.cursor,
		span: f.span ?? s.span,
		bag,
		queue: [...new Set([...extra, ...f.queue])].filter((id) => !shown.includes(id)),
		hot,
		prev: Object.fromEntries(guests.map((g) => [g.id, { cpu: g.cpu, mem: g.mem }])),
		delta,
		bumped: used.map((i) => shown[i]),
		turnAt: used.length ? now + EVERY : s.turnAt
	};
}

/* The first page, with no random draw, so the server render and hydration agree. */
export function init(guests: Guest[], now: number): Rotation {
	const empty: Rotation = { shown: [], crit: [], pinned: [], pool: [], cursor: 0, span: null, bag: [], queue: [], hot: {}, prev: {}, delta: {}, bumped: [], turnAt: 0 };
	return { ...update(empty, guests, now, false, () => 0), turnAt: now + EVERY };
}
