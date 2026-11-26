import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CALLOUTS, CYCLE, FPS, HOLD, LENGTH, LOCKED, LOCKS, PAD, WIPE, extent, fit, matrix, parse, pose, project, type View } from '#lib/art.ts';

const file = readFileSync('src/lib/assets/supra.bin');
const mesh = parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
/* The stage (width, height, --dim) in viewports 1920, 1440, 1280 and 390 px wide. */
const STAGES = [
	[1296, 372, 44],
	[894, 292, 44],
	[782, 292, 44],
	[334, 152, 0]
];

test('the mesh is within its budget', () => {
	expect(mesh.indices.length / 3).toBeLessThanOrEqual(100_000);
	expect(file.byteLength).toBeLessThanOrEqual(2.5e6);
	expect(() => parse(new ArrayBuffer(64))).toThrow();
});

/* A view at scale 1 with its centre at the origin: matrix() then gives the bare rotation. */
const BARE: View = { n: [], s: LOCKS.map(() => 1), ring: [], cloud: mesh.cloud, w: 0, h: 0, dim: 0, x: 0, y: 0 };

test('each hold is the exact view', () => {
	LOCKS.forEach((lock, i) => {
		expect(pose(LOCKED[i] + WIPE + 1)).toEqual(lock);
		expect(pose(LOCKED[i] + WIPE + HOLD - 1)).toEqual(lock);
	});
});

test('each view looks at the car from the right place', () => {
	/* Where the viewer stands: at the car's left, in front of it, above it, behind it. */
	const toward = [[0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 0, 0]];
	const seen = LOCKS.map((lock) => matrix(lock, BARE));
	seen.forEach((m, i) => toward[i].forEach((v, j) => expect(m[8 + j]).toBeCloseTo(v, 9)));
	/* The nose points left in the side elevation and in the plan view, where the car's left side is at the bottom. */
	for (const i of [0, 2]) expect(project([-1, 0, 0], seen[i])[0]).toBeCloseTo(-1, 9);
	expect(project([0, 0, 1], seen[2])[1]).toBeCloseTo(1, 9);
	/* Seen from the front the car's left side is on the right; from behind it is on the left. */
	expect(project([0, 0, 1], seen[1])[0]).toBeCloseTo(1, 9);
	expect(project([0, 0, 1], seen[3])[0]).toBeCloseTo(-1, 9);
});

test('every view locks at a whole scale, clear of the stage edges and the dimension lines', () => {
	for (const [w, h, dim] of STAGES) {
		const v = fit(w, h, mesh, dim);
		LOCKS.forEach((lock, i) => {
			const m = matrix(lock, v);
			expect(Number.isInteger(v.n[i])).toBe(true);
			expect(Math.hypot(m[0], m[2])).toBeCloseTo(LENGTH / v.n[i] / 2, 6);
			for (const x of [-1, 1])
				for (const y of [-mesh.half[1], mesh.half[1]])
					for (const z of [-mesh.half[2], mesh.half[2]]) {
						const [px, py] = project([x, y, z], m);
						expect(Math.min(px, w - dim - px, py, h - dim - py)).toBeGreaterThanOrEqual(PAD - 0.05);
					}
		});
	}
});

/* Every tick of a cycle, in each stage. */
test('the car stays inside the stage, fills it while it turns, and never jumps in size', () => {
	const views = STAGES.map(([w, h, dim]) => fit(w, h, mesh, dim));
	const last: number[] = [];
	let margin = Infinity;
	let fill = Infinity;
	let jump = 0;
	let key = '';
	for (let tick = 0; tick <= CYCLE * FPS; tick++) {
		const p = pose(tick / FPS);
		/* A hold is scanned once. */
		if (key === (key = JSON.stringify(p))) continue;
		/* The extent of the car at unit scale, once per step: the rotation is the same in every stage. */
		const m = matrix(p, views[0]);
		const u = Math.hypot(m[0], m[2]);
		const [x0, x1, y0, y1] = extent([0, 1, 2, 4, 5, 6].map((i) => (i < 4 ? m[i] : -m[i]) / u), mesh.cloud);
		/* A plain loop: a closure here would move the four extremes to the heap and slow the scan above. */
		for (let j = 0; j < views.length; j++) {
			const v = views[j];
			const f = matrix(p, v);
			const s = Math.hypot(f[0], f[2]);
			margin = Math.min(margin, f[3] + s * x0 - PAD, v.w - PAD - f[3] - s * x1, f[7] - s * y1 - PAD, v.h - PAD - f[7] + s * y0);
			if (!p.k) fill = Math.min(fill, Math.max((s * (x1 - x0)) / (v.w - 2 * PAD), (s * (y1 - y0)) / (v.h - 2 * PAD)));
			if (last[j]) jump = Math.max(jump, Math.abs(s / last[j] - 1));
			last[j] = s;
		}
	}
	expect(margin).toBeGreaterThanOrEqual(-0.05);
	expect(fill).toBeGreaterThanOrEqual(0.97);
	expect(jump).toBeLessThan(0.03);
}, 120_000);

test('every part name points at its part', () => {
	const data = new DataView(mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength);
	const [hx, hy, angle] = mesh.pod;
	const mm = 2310; // one unit of the mesh
	for (const { label, piece, at } of Object.values(CALLOUTS).flat()) {
		const lo = [Infinity, Infinity, Infinity];
		const hi = [-Infinity, -Infinity, -Infinity];
		for (let o = 0; o < data.byteLength; o += 10) {
			const part = data.getInt8(o + 9);
			if (piece === 64 ? part < 64 : (part & 60) !== piece) continue;
			let x = data.getInt16(o, true) / 32767;
			let y = data.getInt16(o + 2, true) / 32767;
			/* The headlamp pods are stored retracted and drawn raised. */
			if (part >= 64) [x, y] = [hx + Math.cos(angle) * (x - hx) + Math.sin(angle) * (y - hy), hy - Math.sin(angle) * (x - hx) + Math.cos(angle) * (y - hy)];
			[x, y, data.getInt16(o + 4, true) / 32767].forEach((v, i) => {
				lo[i] = Math.min(lo[i], v * mm);
				hi[i] = Math.max(hi[i], v * mm);
			});
		}
		at.forEach((v, i) => {
			expect(v, label).toBeGreaterThanOrEqual(lo[i] - 10);
			expect(v, label).toBeLessThanOrEqual(hi[i] + 10);
		});
	}
});

test('the page colours keep their contrast, day and night', () => {
	const css = readFileSync('src/app.css', 'utf8');
	const block = (head: string) => css.slice(css.indexOf(head), css.indexOf('}', css.indexOf(head)));
	const day = block('\n:root {');
	for (const theme of [day, day + block(":root[data-theme='dark'] {")]) {
		const luminance = (name: string) => {
			const hex = [...theme.matchAll(new RegExp(`--${name}: #([0-9a-f]{6});`, 'g'))].at(-1)![1];
			const [r, g, b] = [0, 2, 4].map((i) => {
				const v = parseInt(hex.slice(i, i + 2), 16) / 255;
				return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		const contrast = (a: string, b: string) => {
			const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
			return (hi + 0.05) / (lo + 0.05);
		};
		expect(contrast('ink', 'paper')).toBeGreaterThanOrEqual(7);
		expect(contrast('mute', 'paper')).toBeGreaterThanOrEqual(4.5);
		expect(contrast('live', 'paper')).toBeGreaterThanOrEqual(4.5);
		expect(contrast('on-signal', 'signal')).toBeGreaterThanOrEqual(4.5);
		expect(contrast('signal', 'paper')).toBeGreaterThanOrEqual(3);
	}
});
