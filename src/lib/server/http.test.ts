import { expect, test } from 'vitest';
import { unset } from '#lib/poll.svelte.ts';
import { cached, env, expire, peek } from '#lib/server/http.ts';

test('a missing key names every key, and panels read it as not set up', () => {
	expect(() => env('ZZ_A', 'ZZ_B')).toThrow('not set up: ZZ_A, ZZ_B');
	expect(unset('not set up: ZZ_A, ZZ_B')).toBe(true);
	expect(unset('example.com: HTTP 500')).toBe(false);
	expect(unset(null)).toBe(false);
});

test('expire makes the next read fetch again and keeps the last answer for peek', async () => {
	let n = 0;
	const read = () => cached('expire-test', 60_000, async () => ++n);
	expect(await read()).toBe(1);
	expect(await read()).toBe(1);
	expire();
	const next = read();
	expect(peek('expire-test')).toBe(1);
	expect(await next).toBe(2);
});
