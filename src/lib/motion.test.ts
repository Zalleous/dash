import { expect, test } from 'vitest';
import { off } from '#lib/motion.ts';

/* A tile pushed off screen at any angle ends fully outside the 1920 x 1080 view, past the first edge it crosses by
   at most the 40 px margin along its path. */
test('off pushes a rect just past the screen at any angle', () => {
	const r = { left: 600, top: 300, right: 1100, bottom: 700 };
	for (let i = 0; i < 360; i += 7) {
		const { x, y } = off(r, (i * Math.PI) / 180, 1920, 1080);
		const gap = Math.max(-(r.right + x), r.left + x - 1920, -(r.bottom + y), r.top + y - 1080);
		expect(gap).toBeGreaterThan(0);
		expect(gap).toBeLessThanOrEqual(40 + 1e-9);
	}
});

test('off leaves a rect that is already off screen that way where it is, bar the margin', () => {
	const below = { left: 0, top: 1200, right: 400, bottom: 1500 };
	const { x, y } = off(below, Math.PI / 2, 1920, 1080);
	expect(x).toBeCloseTo(0);
	expect(y).toBeCloseTo(40);
});
